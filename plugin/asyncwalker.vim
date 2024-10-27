if exists('g:loaded_asyncwalker')
  finish
endif
let g:loaded_asyncwalker = 1

command! -nargs=* AsyncWalk call asyncwalker#run(<f-args>)
command! AsyncWalkBufferDir call asyncwalker#run_bufferdir()
command! AsyncWalkResume call asyncwalker#resume()

