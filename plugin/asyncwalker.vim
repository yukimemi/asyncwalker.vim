" =============================================================================
" File        : asyncwalker.vim
" Author      : yukimemi
" Last Change : 2024/10/27 17:44:48.
" =============================================================================

if exists('g:loaded_asyncwalker')
  finish
endif
let g:loaded_asyncwalker = 1

command! -nargs=* AsyncWalk call asyncwalker#run(<f-args>)
command! AsyncWalkBufferDir call asyncwalker#run_bufferdir()
command! AsyncWalkResume call asyncwalker#resume()

