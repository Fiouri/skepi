// Objective-C face of libzim 9.7.0 (CoreKiwix.xcframework, pinned in native/kiwix/corekiwix.lock.json) for
// the Swift side of expo-zim. Same operations and limits as crates/zim-ffi/src/shim.cc (desktop) and
// the Kotlin module (Android): open, metadata, title suggestions, Xapian full-text, read an entry.
// No C++ types here: the header is imported by Swift; libzim stays inside SKZArchive.mm.
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

extern NSErrorDomain const SKZErrorDomain;

typedef NS_ERROR_ENUM(SKZErrorDomain, SKZErrorCode) {
  SKZErrorOpen = 1,
  SKZErrorEntryNotFound = 2,
  SKZErrorTooLarge = 3,
  SKZErrorSearch = 4,
};

@interface SKZHit : NSObject
@property(nonatomic, readonly, copy) NSString *path;
@property(nonatomic, readonly, copy) NSString *title;
@property(nonatomic, readonly, copy, nullable) NSString *snippet;
/// Xapian score (full-text only).
@property(nonatomic, readonly) NSInteger score;
@property(nonatomic, readonly) BOOL hasScore;
@end

@interface SKZItem : NSObject
/// Path of the resolved item (redirects followed).
@property(nonatomic, readonly, copy) NSString *path;
@property(nonatomic, readonly, copy) NSString *title;
@property(nonatomic, readonly, copy) NSString *mimeType;
@property(nonatomic, readonly, copy) NSData *data;
@end

/// One open ZIM archive. Reads are thread-safe (libzim); the Xapian searcher and the suggestion searcher
/// are not, so each has its own lock (OpenArchive on Android, the desktop shim).
@interface SKZArchive : NSObject
- (nullable instancetype)initWithPath:(NSString *)path error:(NSError **)error NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

@property(nonatomic, readonly, copy) NSString *path;
@property(nonatomic, readonly, copy) NSString *uuid;
@property(nonatomic, readonly) uint32_t articleCount;
@property(nonatomic, readonly) BOOL hasFulltextIndex;
@property(nonatomic, readonly) BOOL hasTitleIndex;
@property(nonatomic, readonly) uint64_t fileSize;
/// Path of the main page (redirects followed), nil when the archive has none.
@property(nonatomic, readonly, copy, nullable) NSString *mainPath;

/// A metadata value, or "" when the archive does not have it.
- (NSString *)metadata:(NSString *)key;

/// Title suggestions (SuggestionSearcher), at most `limit`.
- (nullable NSArray<SKZHit *> *)suggest:(NSString *)query limit:(NSInteger)limit error:(NSError **)error;

/// Xapian full-text search, at most `limit`; empty when the archive has no full-text index.
- (nullable NSArray<SKZHit *> *)search:(NSString *)query
                                 limit:(NSInteger)limit
                          withSnippets:(BOOL)withSnippets
                      estimatedMatches:(int64_t *_Nullable)estimatedMatches
                                 error:(NSError **)error;

/// Reads an entry (following redirects), refusing anything above `maxBytes`.
- (nullable SKZItem *)readItem:(NSString *)path maxBytes:(uint64_t)maxBytes error:(NSError **)error;

- (BOOL)hasEntry:(NSString *)path;
@end

NS_ASSUME_NONNULL_END
