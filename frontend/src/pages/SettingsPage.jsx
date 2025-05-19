// src/pages/SettingsPage.jsx
import { useState, useEffect } from 'react';
import { preferences } from '../services/api';
import Button from '../components/ui/Button';
import Loader from '../components/ui/Loader';

const SettingsPage = () => {
  const [settings, setSettings] = useState({
    theme: 'dark',
    fontSize: 14,
    tabSize: 2,
    showMinimap: false,
    wordWrap: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [prefsId, setPrefsId] = useState(null);

  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await preferences.get();

        // Check if we have preferences data
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          const prefsData = response.data[0];
          setSettings({
            theme: prefsData.theme || 'dark',
            fontSize: prefsData.font_size || 14,
            tabSize: prefsData.tab_size || 2,
            showMinimap: Boolean(prefsData.show_minimap),
            wordWrap: Boolean(prefsData.word_wrap)
          });
          setPrefsId(prefsData.id);
        }
        // If no data, we'll use defaults that were set in initial state
      } catch (err) {
        console.error('Error fetching preferences:', err);
        setError('Failed to load settings. Using defaults.');
      } finally {
        setLoading(false);
      }
    };

    fetchPreferences();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;

    setSettings(prevSettings => ({
      ...prevSettings,
      [name]: type === 'number' ? parseInt(val, 10) : val
    }));

    // Clear saved message when changes are made
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const settingsData = {
        theme: settings.theme,
        font_size: settings.fontSize,
        tab_size: settings.tabSize,
        show_minimap: settings.showMinimap,
        word_wrap: settings.wordWrap
      };

      if (prefsId) {
        // Update existing preferences
        await preferences.update(prefsId, settingsData);
      } else {
        // Create new preferences
        const response = await preferences.create(settingsData);
        setPrefsId(response.data.id);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Error saving preferences:', err);
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-md mb-6">
          {error}
        </div>
      )}

      {saved && (
        <div className="bg-green-100 text-green-700 p-4 rounded-md mb-6">
          Settings saved successfully!
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Editor Preferences</h2>

        <div className="space-y-6">
          <div className="form-group">
            <label className="block text-gray-700 mb-2">Theme</label>
            <select
              name="theme"
              value={settings.theme}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="highContrast">High Contrast</option>
            </select>
          </div>

          <div className="form-group">
            <label className="block text-gray-700 mb-2">Font Size (px)</label>
            <input
              type="number"
              name="fontSize"
              min="8"
              max="32"
              value={settings.fontSize}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div className="form-group">
            <label className="block text-gray-700 mb-2">Tab Size</label>
            <input
              type="number"
              name="tabSize"
              min="1"
              max="8"
              value={settings.tabSize}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="showMinimap"
              name="showMinimap"
              checked={settings.showMinimap}
              onChange={handleChange}
              className="h-4 w-4 text-indigo-600"
            />
            <label htmlFor="showMinimap" className="ml-2 text-gray-700">
              Show Minimap
            </label>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="wordWrap"
              name="wordWrap"
              checked={settings.wordWrap}
              onChange={handleChange}
              className="h-4 w-4 text-indigo-600"
            />
            <label htmlFor="wordWrap" className="ml-2 text-gray-700">
              Word Wrap
            </label>
          </div>
        </div>

        <div className="mt-8">
          <Button
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;