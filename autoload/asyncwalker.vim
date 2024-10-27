" =============================================================================
" File        : asyncwalker.vim
" Author      : yukimemi
" Last Change : 2024/10/27 16:04:32.
" =============================================================================

function! asyncwalker#denops_notify(method, params) abort
  call denops#plugin#wait_async("asyncwalker", function("denops#notify", ["asyncwalker", a:method, a:params]))
endfunction

function! asyncwalker#run(...) abort
  call asyncwalker#denops_notify("run", a:000)
endfunction

function! asyncwalker#run_bufferdir(...) abort
  call asyncwalker#denops_notify("runBufferDir", a:000)
endfunction

function! asyncwalker#resume(...) abort
  call asyncwalker#denops_notify("resume", a:000)
endfunction

