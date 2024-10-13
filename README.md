# asyncwalker

Denops scan and walk files.

# Features

asyncwalker is a Vim plugin that walks files.

# Installation

If you use [folke/lazy.nvim](https://github.com/folke/lazy.nvim).

```lua
{
  "yukimemi/asyncwalker.vim",
  lazy = false,
  dependencies = {
    "vim-denops/denops.vim",
  },
}
```

If you use [yukimemi/dvpm](https://github.com/yukimemi/dvpm).

```typescript
dvpm.add({ url: "yukimemi/asyncwalker.vim" });
```

# Requirements

- [Deno - A modern runtime for JavaScript and TypeScript](https://deno.land/)
- [vim-denops/denops.vim: 🐜 An ecosystem of Vim/Neovim which allows developers to write cross-platform plugins in Deno](https://github.com/vim-denops/denops.vim)

# Usage

No special settings are required.
`:AsyncWalk` and `:AsyncWalkBufferDir` command are available.

# Commands

`:AsyncWalk [--path=path]`
Walk files and display buffer.
You can filter files by typing.
If --path is not specified, current directory is used.

`:AsyncWalkBufferDir`
Same as `:AsyncWalk --path="%:p:h"`.

`:AsyncWalkResume`
Resume walk buffer.

# Config

No settings are required. However, the following settings can be made if necessary.

`g:asyncwalker_debug`
Enable debug messages.
default is v:false

`g:asyncwalker_height`
Height of walk buffer.
default is 15

`g:asyncwalker_chunk`
Chunk size of walk buffer.
default is 500

`g:asyncwalker_ignore`
Ignore patterns.
default is ["\\.git", "\\.svn", "\\.hg", "\\.o$", "\\.obj$", "\\.a$", "\\.exe~?$", "tags$"]

`g:asyncwalker_no_mapping`
Whether to disable default mappings.
default is v:false

# Mappings

On filter buffer (`asyncwalker-filter`), you can use the following mappings.

`<Plug>(asyncwalker-cursor-down)`
Cursor move next line. (Default is <C-j>)

`<Plug>(asyncwalker-cursor-up)`
Cursor move previous line. (Default is <C-k>)

`<Plug>(asyncwalker-escape)`
Escape filter buffer and go to walk buffer. (Default is <ESC>)

`<Plug>(asyncwalker-enter)`
Open cursor selected line. (Default is <CR>)

`<Plug>(asyncwalker-quit)`
Quit walk and filter buffer. (Default is <ESC>)

`<Plug>(asyncwalker-insert)`
Go to filter buffer. (Default is i and a)

# Example

```vim
nnoremap <space>wa <cmd>AsyncWalk<cr>
nnoremap <space>ws <cmd>AsyncWalk --path=~/src<cr>
nnoremap <space>wD <cmd>AsyncWalk --path=~/.dotfiles<cr>
nnoremap <space>wc <cmd>AsyncWalk --path=~/.cache<cr>
nnoremap <space>wm <cmd>AsyncWalk --path=~/.memolist<cr>
nnoremap <space>wd <cmd>AsyncWalkBufferDir<cr>
nnoremap <space>wr <cmd>AsyncWalkResume<cr>
```

# License

Licensed under MIT License.

Copyright (c) 2023 yukimemi

