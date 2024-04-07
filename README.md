# scanwalker

Denops scan and walk files.

# Features

scanwalker is a Vim plugin that walks files.

# Installation

If you use [folke/lazy.nvim](https://github.com/folke/lazy.nvim).

```lua
{
  "yukimemi/scanwalker.vim",
  lazy = false,
  dependencies = {
    "vim-denops/denops.vim",
  },
}
```

If you use [yukimemi/dvpm](https://github.com/yukimemi/dvpm).

```typescript
dvpm.add({ url: "yukimemi/scanwalker.vim" });
```

# Requirements

- [Deno - A modern runtime for JavaScript and TypeScript](https://deno.land/)
- [vim-denops/denops.vim: 🐜 An ecosystem of Vim/Neovim which allows developers to write cross-platform plugins in Deno](https://github.com/vim-denops/denops.vim)

# Usage

No special settings are required.
`:ScanWalk` and `:ScanWalkBufferDir` command are available.

# Commands

`:ScanWalk [--path=path]`
Walk files and display buffer.
You can filter files by typing.
If --path is not specified, current directory is used.

`:ScanWalkBufferDir`
Same as `:ScanWalk --path="%:p:h"`.

# Config

No settings are required. However, the following settings can be made if necessary.

`g:scanwalker_debug`
Enable debug messages.
default is v:false

`g:scanwalker_height`
Height of walk buffer.
default is 15

`g:scanwalker_chunk`
Chunk size of walk buffer.
default is 500

`g:scanwalker_ignore`
Ignore patterns.
default is ["\\.git", "\\.svn", "\\.hg", "\\.o$", "\\.obj$", "\\.a$", "\\.exe~?$", "tags$"]

`g:scanwalker_no_mapping`
Whether to disable default mappings.
default is v:false

# Mappings

On filter buffer (`scanwalker-filter`), you can use the following mappings.

`<Plug>(scanwalker-cursor-down)`
Cursor move next line. (Default is <C-j>)

`<Plug>(scanwalker-cursor-up)`
Cursor move previous line. (Default is <C-k>)

`<Plug>(scanwalker-escape)`
Escape filter buffer and go to walk buffer. (Default is <ESC>)

`<Plug>(scanwalker-enter)`
Open cursor selected line. (Default is <CR>)

`<Plug>(scanwalker-quit)`
Quit walk and filter buffer. (Default is <ESC>)

`<Plug>(scanwalker-insert)`
Go to filter buffer. (Default is i and a)

# Example

```vim
nnoremap <space>wa <cmd>ScanWalk<cr>
nnoremap <space>ws <cmd>ScanWalk --path=~/src<cr>
nnoremap <space>wD <cmd>ScanWalk --path=~/.dotfiles<cr>
nnoremap <space>wc <cmd>ScanWalk --path=~/.cache<cr>
nnoremap <space>wm <cmd>ScanWalk --path=~/.memolist<cr>
nnoremap <space>wd <cmd>ScanWalkBufferDir<cr>
```

# License

Licensed under MIT License.

Copyright (c) 2023 yukimemi

