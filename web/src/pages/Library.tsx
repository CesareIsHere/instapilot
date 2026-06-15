import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff, Plus, Layers, FileImage } from 'lucide-react';
import { api, type LibraryItem } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtRelative } from '@/lib/utils';

function ContentCard({ item }: { item: LibraryItem }) {
  return (
    <Link to={`/content/${item.id}`} className="group block">
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
        {/* Cover */}
        <div className="relative overflow-hidden bg-muted" style={{ aspectRatio: '4/5' }}>
          {item.coverUrl ? (
            <img
              src={item.coverUrl}
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageOff className="text-muted-foreground/25" size={36} />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute top-2.5 left-2.5">
            <Badge variant={item.format === 'carousel' ? 'blue' : 'green'} className="text-[10px] uppercase tracking-wide font-bold">
              {item.format === 'carousel' ? 'Carosello' : 'Post'}
            </Badge>
          </div>
        </div>
        {/* Body */}
        <div className="p-3">
          <p className="text-sm font-semibold line-clamp-2 leading-tight mb-1.5">
            {item.title || item.topic || 'Senza titolo'}
          </p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              {item.format === 'carousel' ? <Layers size={11} /> : <FileImage size={11} />}
              {item.slideCount} slide
            </span>
            <span>{fmtRelative(item.updatedAt || item.createdAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function LibrarySkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-xl border overflow-hidden">
          <Skeleton className="w-full rounded-none" style={{ aspectRatio: '4/5' }} />
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Library() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.library.list()
      .then(data => setItems(data.items))
      .catch(err => setError((err as Error).message));
  }, []);

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Libreria</h1>
          {items !== null && (
            <p className="text-sm text-muted-foreground mt-1">
              {items.length} {items.length === 1 ? 'contenuto' : 'contenuti'} generati
            </p>
          )}
        </div>
        <Button asChild>
          <Link to="/new"><Plus size={16} />Nuovo contenuto</Link>
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {items === null && !error && <LibrarySkeleton />}

      {items !== null && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <ImageOff className="text-muted-foreground/50" size={28} />
          </div>
          <h2 className="text-lg font-semibold mb-1">Ancora nessun contenuto</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Crea il tuo primo post o carosello Instagram con l'AI.
          </p>
          <Button asChild>
            <Link to="/new"><Plus size={16} />Crea il primo contenuto</Link>
          </Button>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map(item => <ContentCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}
