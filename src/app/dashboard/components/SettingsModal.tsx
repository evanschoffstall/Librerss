interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal = ({ onClose }: SettingsModalProps) => (
  <div className="dashboard-modal-backdrop">
    {/* Backdrop */}
    <div
      className="dashboard-modal-overlay"
      onClick={onClose}
    />

    {/* Modal Content */}
    <div className="dashboard-modal-content">
      <div className="dashboard-modal-header">
        <h2 className="text-3xl font-bold text-white">Dashboard Settings</h2>
        <button
          onClick={onClose}
          className="dashboard-modal-close"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="settings-grid">
        {/* Feed Management */}
        <div className="settings-section">
          <h3 className="settings-section-title">Feed Management</h3>

          <div className="space-y-4">
            <button className="settings-option">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <div>
                <div className="text-white font-medium">Add New Feed</div>
                <div className="text-gray-400 text-sm">Subscribe to RSS feeds</div>
              </div>
            </button>

            <button className="settings-option">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <div>
                <div className="text-white font-medium">Organize Categories</div>
                <div className="text-gray-400 text-sm">Manage feed categories</div>
              </div>
            </button>

            <button className="settings-option">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <div>
                <div className="text-white font-medium">Remove Feeds</div>
                <div className="text-gray-400 text-sm">Unsubscribe from feeds</div>
              </div>
            </button>
          </div>
        </div>

        {/* Preferences */}
        <div className="settings-section">
          <h3 className="settings-section-title">Preferences</h3>

          <div className="space-y-4">
            <div className="glass-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">Auto-refresh</div>
                  <div className="text-gray-400 text-sm">Automatically refresh feeds</div>
                </div>
                <div className="settings-toggle">
                  <div className="settings-toggle-handle"></div>
                </div>
              </div>
            </div>

            <div className="glass-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">Dark mode</div>
                  <div className="text-gray-400 text-sm">Use dark theme</div>
                </div>
                <div className="settings-toggle">
                  <div className="settings-toggle-handle"></div>
                </div>
              </div>
            </div>

            <div className="glass-card p-4">
              <div>
                <div className="text-white font-medium mb-2">Articles per page</div>
                <select className="w-full p-2 bg-white/5 border border-white/20 rounded-lg text-white">
                  <option value="10">10 articles</option>
                  <option value="25">25 articles</option>
                  <option value="50">50 articles</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Export/Import Section */}
      <div className="mt-8 pt-6 border-t border-white/20">
        <h3 className="text-xl font-semibold text-white mb-4">Data Management</h3>
        <div className="flex space-x-4">
          <button className="glass-card px-6 py-3 hover:bg-white/10 transition-all duration-300 text-white">
            Export OPML
          </button>
          <button className="glass-card px-6 py-3 hover:bg-white/10 transition-all duration-300 text-white">
            Import OPML
          </button>
          <button className="glass-card px-6 py-3 hover:bg-white/10 transition-all duration-300 text-white">
            Backup Settings
          </button>
        </div>
      </div>
    </div>
  </div>
);
