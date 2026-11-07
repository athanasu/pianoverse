import { BrowserRouter, Route, Routes } from 'react-router'
import { LibraryScreen } from './library/LibraryScreen'
import { PlayerScreen } from './player/PlayerScreen'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LibraryScreen />} />
        <Route path="/song/:id" element={<PlayerScreen />} />
      </Routes>
    </BrowserRouter>
  )
}
