// C++ side of the zim-ffi bridge: a thin, exception-safe wrapper over zim::Archive. Xapian handles
// are not thread-safe, so each archive keeps one searcher and one suggestion searcher behind locks
// (like OpenArchive in modules/expo-zim). Every libzim exception reaches Rust as Err (cxx Result).
#pragma once

#include <memory>
#include <mutex>
#include <string>

#include <zim/archive.h>
#include <zim/blob.h>
#include <zim/search.h>
#include <zim/suggestion.h>

#include "rust/cxx.h"

namespace skepi_zim {

struct ArchiveMeta;
struct Hit;

/// One entry's content: the blob stays owned by libzim's cache, Rust reads it as a slice (no copy).
class Item {
 public:
  Item(std::string path, std::string title, std::string mime, zim::Blob blob)
      : path_(std::move(path)), title_(std::move(title)), mime_(std::move(mime)), blob_(std::move(blob)) {}
  rust::Str path() const { return rust::Str(path_); }
  rust::Str title() const { return rust::Str(title_); }
  rust::Str mime() const { return rust::Str(mime_); }
  rust::Slice<const uint8_t> data() const {
    return rust::Slice<const uint8_t>(reinterpret_cast<const uint8_t*>(blob_.data()), blob_.size());
  }

 private:
  std::string path_, title_, mime_;
  zim::Blob blob_;
};

class Archive {
 public:
  explicit Archive(const std::string& path);

  ArchiveMeta meta() const;
  rust::Vec<Hit> suggest(rust::Str query, uint32_t limit) const;
  rust::Vec<Hit> search(rust::Str query, uint32_t limit, bool with_snippets) const;
  std::unique_ptr<Item> read_item(rust::Str path, uint64_t max_bytes) const;
  bool has_entry(rust::Str path) const;

 private:
  zim::Archive archive_;
  mutable std::mutex search_lock_;
  mutable std::mutex suggest_lock_;
  mutable std::unique_ptr<zim::Searcher> searcher_;
  mutable std::unique_ptr<zim::SuggestionSearcher> suggester_;
};

std::unique_ptr<Archive> open_archive(rust::Str path);

}  // namespace skepi_zim
