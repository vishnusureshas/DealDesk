import { formatTime, initials } from '../../lib/format';

export default function MessageBubble({ message, mine, onRetry, grouped = false }) {
  return (
    <li
      className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
    >
      {!mine &&
        (grouped ? (
          <span className="h-6 w-6 shrink-0" aria-hidden="true" />
        ) : (
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
            {initials(String(message.senderId))}
          </span>
        ))}
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          mine
            ? 'bg-brand-500 text-white'
            : 'bg-white text-slate-800 ring-1 ring-slate-200'
        } ${message.failed ? 'ring-2 ring-rose-400' : ''} ${
          message.pending ? 'opacity-70' : ''
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p
          className={`mt-1 text-right text-[10px] ${
            mine ? 'text-white/70' : 'text-slate-400'
          }`}
        >
          {formatTime(message.createdAt)}
          {message.pending ? ' · sending' : ''}
        </p>
        {message.failed && (
          <button
            type="button"
            onClick={() => onRetry(message)}
            className="mt-1 text-[11px] font-medium text-rose-600 underline"
          >
            Failed — retry
          </button>
        )}
      </div>
    </li>
  );
}
