'use client';

import { useMemo, useState } from 'react';
import {
  PAZE_CATEGORIES,
  PAZE_MERCHANTS,
  PAZE_DIRECTORY_CAPTURED,
  PAZE_PROMO,
  type PazeCategory,
} from './merchants';

type Filter = PazeCategory | 'All';
/** Merchants with field notes are the reason to visit, so they get their own filter. */
type NotesFilter = 'all' | 'with-notes';

export default function PazeTrackerClient() {
  const [category, setCategory] = useState<Filter>('All');
  const [notesOnly, setNotesOnly] = useState<NotesFilter>('all');
  const [query, setQuery] = useState('');

  const withNotesCount = useMemo(
    () => PAZE_MERCHANTS.filter((m) => m.usage || m.community).length,
    [],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PAZE_MERCHANTS.filter((m) => {
      if (category !== 'All' && m.category !== category) return false;
      if (notesOnly === 'with-notes' && !m.usage && !m.community) return false;
      if (q && !m.name.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => {
      // Merchants we know something about lead; the rest stay alphabetical so
      // the list is still scannable as a directory.
      const known = (m: typeof a) => Boolean(m.usage || m.community);
      if (known(a) !== known(b)) return known(a) ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [category, notesOnly, query]);

  return (
    <div className="labs-paze">
      {/* Stated up front because almost every note below is a consequence of
          this promo, and most of them stop meaning anything the day it ends. */}
      <div className="labs-promo">
        <span className="labs-tag">Paze offer</span>
        <span>
          {PAZE_PROMO.text} Runs through {PAZE_PROMO.endsOn}. Most of the behaviour
          below exists because of it.
        </span>
      </div>

      <div className="labs-controls">
        <input
          type="search"
          className="labs-search"
          placeholder="Search merchants"
          aria-label="Search merchants"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="labs-chips" role="group" aria-label="Filter by category">
          <button
            type="button"
            className={`labs-chip${category === 'All' ? ' is-active' : ''}`}
            onClick={() => setCategory('All')}
          >
            All ({PAZE_MERCHANTS.length})
          </button>
          {PAZE_CATEGORIES.map((c) => {
            const n = PAZE_MERCHANTS.filter((m) => m.category === c).length;
            if (n === 0) return null;
            return (
              <button
                key={c}
                type="button"
                className={`labs-chip${category === c ? ' is-active' : ''}`}
                onClick={() => setCategory(c)}
              >
                {c} ({n})
              </button>
            );
          })}
          <button
            type="button"
            className={`labs-chip labs-chip-notes${notesOnly === 'with-notes' ? ' is-active' : ''}`}
            onClick={() => setNotesOnly(notesOnly === 'with-notes' ? 'all' : 'with-notes')}
            aria-pressed={notesOnly === 'with-notes'}
          >
            Has notes ({withNotesCount})
          </button>
        </div>
      </div>

      <p className="labs-count">
        {visible.length} of {PAZE_MERCHANTS.length} merchants
        {notesOnly === 'with-notes' && ' with field notes'}
      </p>

      {visible.length === 0 ? (
        <p className="labs-empty">
          No merchants match that. Clear the search or pick a different category.
        </p>
      ) : (
        <ul className="labs-list">
          {visible.map((m) => (
            <li key={m.slug} className="labs-row">
              <div className="labs-row-head">
                <a
                  href={m.url}
                  className="labs-row-name"
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  {m.name}
                </a>
                <span className="labs-row-cat">{m.category}</span>
              </div>

              {m.offer && (
                <p className="labs-row-offer">
                  <span className="labs-tag">Paze offer</span>
                  {m.offer}
                </p>
              )}

              {m.usage && <p className="labs-row-usage">{m.usage}</p>}

              {m.community && (
                <div className="labs-row-community">
                  <p className="labs-row-community-note">
                    <span className="labs-tag labs-tag-community">Reported</span>
                    {m.community.note}
                  </p>
                  <p className="labs-row-community-meta">
                    User reports as of {m.community.asOf}, not verified by us.{' '}
                    <a href={m.community.source} target="_blank" rel="noopener noreferrer nofollow">
                      Source
                    </a>
                  </p>
                </div>
              )}

              {!m.usage && !m.community && (
                <p className="labs-row-empty">
                  No notes yet. If you have used Paze here, tell us how it works and we
                  will add it.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="labs-source">
        Merchant list transcribed from Paze&apos;s own directory on {PAZE_DIRECTORY_CAPTURED}.
        Rows marked <strong>Reported</strong> summarise what users describe publicly; they
        are dated and linked, and we have not verified them. This behaviour changes fast:
        the Dunkin reload throttle was reported lifted three days after it was written up
        as settled. Paze&apos;s directory also lags what people report actually working, so
        merchants can accept Paze without appearing above. Offers are quoted from Paze and
        can end without notice.
      </p>
    </div>
  );
}
