# dps-walk

Denops walk files.

# Features 

dps-walk is a Vim plugin that walks files.

# Installation 

If you use [folke/lazy.nvim](https://github.com/folke/lazy.nvim).

```
  {
    "yukimemi/dps-walk",
    lazy = false,
    dependencies = {
      "vim-denops/denops.vim",
    },
  }
```

If you use [yukimemi/dvpm](https://github.com/yukimemi/dvpm).

```
  dvpm.add({ url: "yukimemi/dps-walk" });
```

# Requirements 

- [Deno - A modern runtime for JavaScript and TypeScript](https://deno.land/)
- [vim-denops/denops.vim: 🐜 An ecosystem of Vim/Neovim which allows developers to write cross-platform plugins in Deno](https://github.com/vim-denops/denops.vim)
# Usage 

No special settings are required.
`:DenopsWalk` and `:DenopsWalkBufferDir` command are available.

# Commands 

`:DenopsWalk [--path=path]`                                      
Walk files and display buffer.
You can filter files by typing.
If --path is not specified, current directory is used.

`:DenopsWalkBufferDir`                                  
Same as `:DenopsWalk --path="%:p:h"`.

# Config 

No settings are required. However, the following settings can be made if necessary.

`g:walk_debug`                                                  
Enable debug messages.
default is v:false

`g:walk_height`                                                
Height of walk buffer.
default is 15

`g:walk_chunk`                                                  
Chunk size of walk buffer.
default is 500

`g:walk_ignore`                                                
Ignore patterns.
default is ["\\.git", "\\.svn", "\\.hg", "\\.o$", "\\.obj$", "\\.a$", "\\.exe~?$", "tags$"]

`g:walk_no_mapping`                                        
Whether to disable default mappings.
default is v:false

# Mappings 

On filter buffer (`dpswalk-filter`), you can use the following mappings.

`<Plug>(dps-walk-cursor-down)`                    
Cursor move next line. (Default is <C-j>)

`<Plug>(dps-walk-cursor-up)`                        
Cursor move previous line. (Default is <C-k>)

`<Plug>(dps-walk-escape)`                              
Escape filter buffer and go to walk buffer. (Default is <ESC>)

`<Plug>(dps-walk-enter)`                                
Open cursor selected line. (Default is <CR>)

On walk result buffer (`dpswalk`), the following mappings are enabled.

`<Plug>(dps-walk-enter)`                                
Open cursor selected line. (Default is <CR>)

`<Plug>(dps-walk-quit)`                                  
Quit walk and filter buffer. (Default is <ESC>)

`<Plug>(dps-walk-insert)`                              
Go to filter buffer. (Default is i and a)

# Example 

```
  nnoremap <space>wa <cmd>DenopsWalk<cr>
  nnoremap <space>ws <cmd>DenopsWalk --path=~/src<cr>
  nnoremap <space>wD <cmd>DenopsWalk --path=~/.dotfiles<cr>
  nnoremap <space>wc <cmd>DenopsWalk --path=~/.cache<cr>
  nnoremap <space>wm <cmd>DenopsWalk --path=~/.memolist<cr>
  nnoremap <space>wd <cmd>DenopsWalkBufferDir<cr>
```

# License 

Licensed under MIT License.

Copyright (c) 2023 yukimemi

