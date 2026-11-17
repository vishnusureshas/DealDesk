import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-sm text-center">
        <Compass className="mx-auto h-8 w-8 text-slate-300" />
        <h1 className="mt-3 text-lg font-semibold text-ink-900">
          Page not found
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          The page you are looking for does not exist or has moved.
        </p>
        <Link to="/deals" className="mt-4 inline-block">
          <Button size="sm">Back to deals</Button>
        </Link>
      </div>
    </div>
  );
}
