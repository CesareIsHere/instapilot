import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Sidebar } from '@/components/layout/Sidebar';
import { Library } from '@/pages/Library';
import { NewContent } from '@/pages/NewContent';
import { Jobs } from '@/pages/Jobs';
import { JobDetail } from '@/pages/JobDetail';
import { ContentDetail } from '@/pages/ContentDetail';
import { BrandKit } from '@/pages/BrandKit';
import { Settings } from '@/pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 ml-56 min-h-screen">
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/new" element={<NewContent />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/brand" element={<BrandKit />} />
            <Route path="/job/:id" element={<JobDetail />} />
            <Route path="/content/:id" element={<ContentDetail />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
      <Toaster richColors position="bottom-center" />
    </BrowserRouter>
  );
}
