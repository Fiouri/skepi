#import "SKZArchive.h"

#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>

#include <zim/archive.h>
#include <zim/entry.h>
#include <zim/error.h>
#include <zim/item.h>
#include <zim/search.h>
#include <zim/suggestion.h>

NSErrorDomain const SKZErrorDomain = @"org.skepi.zim";

namespace {

NSString *ToNS(const std::string &s) {
  NSString *out = [[NSString alloc] initWithBytes:s.data() length:s.size() encoding:NSUTF8StringEncoding];
  return out ?: @"";
}

std::string ToStd(NSString *s) {
  const char *utf8 = s.UTF8String;
  return utf8 ? std::string(utf8) : std::string();
}

void Fail(NSError **error, SKZErrorCode code, NSString *message) {
  if (error) *error = [NSError errorWithDomain:SKZErrorDomain code:code userInfo:@{NSLocalizedDescriptionKey : message}];
}

NSString *What(const std::exception &e) { return ToNS(e.what()); }

}  // namespace

@interface SKZHit ()
- (instancetype)initWithPath:(NSString *)path
                       title:(NSString *)title
                     snippet:(nullable NSString *)snippet
                       score:(NSInteger)score
                    hasScore:(BOOL)hasScore;
@end

@implementation SKZHit
- (instancetype)initWithPath:(NSString *)path
                       title:(NSString *)title
                     snippet:(NSString *)snippet
                       score:(NSInteger)score
                    hasScore:(BOOL)hasScore {
  if ((self = [super init])) {
    _path = [path copy];
    _title = [title copy];
    _snippet = [snippet copy];
    _score = score;
    _hasScore = hasScore;
  }
  return self;
}
@end

@interface SKZItem ()
- (instancetype)initWithPath:(NSString *)path title:(NSString *)title mimeType:(NSString *)mimeType data:(NSData *)data;
@end

@implementation SKZItem
- (instancetype)initWithPath:(NSString *)path title:(NSString *)title mimeType:(NSString *)mimeType data:(NSData *)data {
  if ((self = [super init])) {
    _path = [path copy];
    _title = [title copy];
    _mimeType = [mimeType copy];
    _data = [data copy];
  }
  return self;
}
@end

@implementation SKZArchive {
  std::unique_ptr<zim::Archive> _archive;
  std::mutex _searchLock;
  std::mutex _suggestLock;
  std::unique_ptr<zim::Searcher> _searcher;
  std::unique_ptr<zim::SuggestionSearcher> _suggester;
}

- (nullable instancetype)initWithPath:(NSString *)path error:(NSError **)error {
  if (!(self = [super init])) return nil;
  try {
    _archive = std::make_unique<zim::Archive>(ToStd(path));
    _path = [path copy];
    _uuid = ToNS(static_cast<std::string>(_archive->getUuid()));
    _articleCount = _archive->getArticleCount();
    _hasFulltextIndex = _archive->hasFulltextIndex();
    _hasTitleIndex = _archive->hasTitleIndex();
    _fileSize = _archive->getFilesize();
    _mainPath = nil;
    if (_archive->hasMainEntry()) {
      try {
        _mainPath = ToNS(_archive->getMainEntry().getItem(true).getPath());
      } catch (const std::exception &) {
        _mainPath = nil;
      }
    }
  } catch (const std::exception &e) {
    Fail(error, SKZErrorOpen, [NSString stringWithFormat:@"Cannot open %@: %@", path, What(e)]);
    return nil;
  }
  return self;
}

- (NSString *)metadata:(NSString *)key {
  try {
    return ToNS(_archive->getMetadata(ToStd(key)));
  } catch (const std::exception &) {
    return @"";
  }
}

- (nullable NSArray<SKZHit *> *)suggest:(NSString *)query limit:(NSInteger)limit error:(NSError **)error {
  std::lock_guard<std::mutex> guard(_suggestLock);
  try {
    if (!_suggester) _suggester = std::make_unique<zim::SuggestionSearcher>(*_archive);
    auto search = _suggester->suggest(ToStd(query));
    auto results = search.getResults(0, static_cast<int>(limit));
    NSMutableArray<SKZHit *> *out = [NSMutableArray array];
    for (auto it = results.begin(); it != results.end(); ++it) {
      NSString *snippet = it->hasSnippet() ? ToNS(it->getSnippet()) : nil;
      [out addObject:[[SKZHit alloc] initWithPath:ToNS(it->getPath()) title:ToNS(it->getTitle()) snippet:snippet score:0 hasScore:NO]];
    }
    return out;
  } catch (const std::exception &e) {
    Fail(error, SKZErrorSearch, [NSString stringWithFormat:@"Suggestions failed: %@", What(e)]);
    return nil;
  }
}

- (nullable NSArray<SKZHit *> *)search:(NSString *)query
                                 limit:(NSInteger)limit
                          withSnippets:(BOOL)withSnippets
                      estimatedMatches:(int64_t *)estimatedMatches
                                 error:(NSError **)error {
  std::lock_guard<std::mutex> guard(_searchLock);
  if (estimatedMatches) *estimatedMatches = 0;
  NSMutableArray<SKZHit *> *out = [NSMutableArray array];
  if (!_hasFulltextIndex) return out;
  try {
    if (!_searcher) _searcher = std::make_unique<zim::Searcher>(*_archive);
    zim::Query q{ToStd(query)};
    auto search = _searcher->search(q);
    if (estimatedMatches) *estimatedMatches = static_cast<int64_t>(search.getEstimatedMatches());
    auto results = search.getResults(0, static_cast<int>(limit));
    for (auto it = results.begin(); it != results.end(); ++it) {
      NSString *snippet = withSnippets ? ToNS(it.getSnippet()) : nil;
      [out addObject:[[SKZHit alloc] initWithPath:ToNS(it.getPath())
                                            title:ToNS(it.getTitle())
                                          snippet:snippet
                                            score:it.getScore()
                                         hasScore:YES]];
    }
    return out;
  } catch (const std::exception &e) {
    Fail(error, SKZErrorSearch, [NSString stringWithFormat:@"Search failed: %@", What(e)]);
    return nil;
  }
}

- (nullable SKZItem *)readItem:(NSString *)path maxBytes:(uint64_t)maxBytes error:(NSError **)error {
  try {
    zim::Entry entry = _archive->getEntryByPath(ToStd(path));
    // getItem(true) follows redirect chains (libzim bounds the chain).
    zim::Item item = entry.getItem(true);
    const uint64_t size = static_cast<uint64_t>(item.getSize());
    if (size > maxBytes) {
      Fail(error, SKZErrorTooLarge, [NSString stringWithFormat:@"Entry '%@' is %llu bytes (max %llu)", path, size, maxBytes]);
      return nil;
    }
    zim::Blob blob = item.getData();
    NSData *data = [NSData dataWithBytes:blob.data() length:blob.size()];
    return [[SKZItem alloc] initWithPath:ToNS(item.getPath()) title:ToNS(item.getTitle()) mimeType:ToNS(item.getMimetype()) data:data];
  } catch (const zim::EntryNotFound &e) {
    Fail(error, SKZErrorEntryNotFound, [NSString stringWithFormat:@"No entry '%@': %@", path, What(e)]);
    return nil;
  } catch (const std::exception &e) {
    Fail(error, SKZErrorEntryNotFound, [NSString stringWithFormat:@"No entry '%@': %@", path, What(e)]);
    return nil;
  }
}

- (BOOL)hasEntry:(NSString *)path {
  try {
    return _archive->hasEntryByPath(ToStd(path)) ? YES : NO;
  } catch (const std::exception &) {
    return NO;
  }
}

@end
