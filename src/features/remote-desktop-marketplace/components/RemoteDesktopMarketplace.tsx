// ─── Remote Desktop Marketplace — Root Workspace Shell ────────────────────────
//
// The root component for the Remote Desktop Marketplace.
// Renders inside the AppShell — does NOT create its own sidebar/header/page chrome.
// Uses .hero for dashboard header, .panel for content containers, .pill for badges.

import { useState, useCallback } from 'react';
import { MARKETPLACE_ALLOWED_ROLES } from '../constants';
import { useFavourites } from '../hooks/useFavourites';
import CatalogueBrowser from './CatalogueBrowser';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RemoteDesktopMarketplaceProps {
  user: { role: string; displayName?: string };
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type MarketplaceTab = 'browse' | 'my-bookings' | 'favourites';

const TABS: { id: MarketplaceTab; label: string }[] = [
  { id: 'browse', label: 'Browse' },
  { id: 'my-bookings', label: 'My Bookings' },
  { id: 'favourites', label: 'Favourites' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function RemoteDesktopMarketplace({
  user,
}: RemoteDesktopMarketplaceProps) {
  const [activeTab, setActiveTab] = useState<MarketplaceTab>('browse');

  // Role gate — check if user role is in MARKETPLACE_ALLOWED_ROLES
  const isAllowed = (MARKETPLACE_ALLOWED_ROLES as readonly string[]).includes(
    user.role
  );

  // Favourites state (shared between Browse tab and Favourites tab)
  const {
    isFavourited,
    addFavourite,
    removeFavourite,
  } = useFavourites();

  // Toggle favourite handler
  const handleToggleFavourite = useCallback(
    (listingId: string) => {
      if (isFavourited(listingId)) {
        removeFavourite(listingId);
      } else {
        addFavourite(listingId);
      }
    },
    [isFavourited, addFavourite, removeFavourite]
  );

  // Navigate to listing detail
  const handleSelectListing = useCallback((listingId: string) => {
    // Navigation is handled by the parent router — emit event or use navigate
    // For now, update window location to the detail route
    window.location.hash = `/remote-desktop/marketplace/${listingId}`;
  }, []);

  // ─── Role Gate: Redirect if not allowed ───────────────────────────────────

  if (!isAllowed) {
    // Redirect to Remote Desktop module root
    // Using setTimeout to give a clean render cycle before redirect
    setTimeout(() => {
      window.location.hash = '/remote-desktop';
    }, 0);

    return null;
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">REMOTE DESKTOP</div>
            <h1>Marketplace</h1>
            <p className="sub">
              Discover and book remote desktop resources for your projects
              <span style={{ marginLeft: 8 }}>
                <span
                  className="pill"
                  style={{ fontSize: 10, marginLeft: 4 }}
                >
                  <span className="dot" />
                  {user.role.replace(/_/g, ' ')}
                </span>
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <nav
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 0,
        }}
        role="tablist"
        aria-label="Marketplace navigation"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--teal)' : 'var(--muted)',
              background: 'none',
              border: 'none',
              borderBottom:
                activeTab === tab.id
                  ? '2px solid var(--teal)'
                  : '2px solid transparent',
              cursor: 'pointer',
              transition: 'color 0.15s ease, border-color 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Active Tab Content */}
      <div
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={activeTab}
      >
        {activeTab === 'browse' && (
          <CatalogueBrowser
            isFavourited={isFavourited}
            onToggleFavourite={handleToggleFavourite}
            onSelectListing={handleSelectListing}
          />
        )}

        {activeTab === 'my-bookings' && (
          <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              My Bookings view is rendered here.
            </p>
          </section>
        )}

        {activeTab === 'favourites' && (
          <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              Favourites view is rendered here.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
