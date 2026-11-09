import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { LibraryScreen } from './library/LibraryScreen'
import { NewSongScreen } from './newsong/NewSongScreen'
import { PlayerScreen } from './player/PlayerScreen'
import { ProcessingScreen } from './processing/ProcessingScreen'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LibraryScreen />} />
        <Route path="/new" element={<NewSongScreen />} />
        <Route path="/processing/:jobId" element={<ProcessingScreen />} />
        <Route path="/song/:id" element={<PlayerScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
