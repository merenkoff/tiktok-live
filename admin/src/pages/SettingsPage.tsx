// admin/src/pages/SettingsPage.tsx

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { UserSettings } from '../types';
import { Header } from '../components/Header';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function SettingsPage() {
  const [formData, setFormData] = useState<Partial<UserSettings>>({
    telegram_bot_token: '',
    telegram_channel_id: undefined,
    novaposhta_api_key: '',
    novaposhta_merchant_name: '',
    reservation_timeout_minutes: 5,
    payment_timeout_minutes: 10,
  });
  const [testResult, setTestResult] = useState<{ ok?: boolean; message?: string } | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Fetch current settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });

  // Update settings
  const updateMutation = useMutation({
    mutationFn: (data: Partial<UserSettings>) => api.updateSettings(data),
    onSuccess: () => {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    },
  });

  // Test Telegram
  const testMutation = useMutation({
    mutationFn: () => api.testTelegram(),
    onSuccess: (result) => {
      setTestResult(result);
      setTimeout(() => setTestResult(null), 5000);
    },
  });

  // Load settings into form
  useEffect(() => {
    if (settings) {
      setFormData({
        telegram_bot_token: settings.telegram_bot_token || '',
        telegram_channel_id: settings.telegram_channel_id,
        novaposhta_api_key: settings.novaposhta_api_key || '',
        novaposhta_merchant_name: settings.novaposhta_merchant_name || '',
        reservation_timeout_minutes: settings.reservation_timeout_minutes || 5,
        payment_timeout_minutes: settings.payment_timeout_minutes || 10,
      });
    }
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name.includes('timeout') || name.includes('channel_id') ? parseInt(value) : value,
    }));
  };

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleTestTelegram = () => {
    testMutation.mutate();
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-8 text-gray-900">Settings</h1>

          {showSuccess && (
            <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
              ✅ Settings saved successfully!
            </div>
          )}

          {/* Telegram Section */}
          <div className="mb-8 pb-8 border-b">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">🤖 Telegram Bot</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bot Token
                </label>
                <input
                  type="password"
                  name="telegram_bot_token"
                  value={formData.telegram_bot_token || ''}
                  onChange={handleChange}
                  placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-sm text-gray-500 mt-2">
                  Get from @BotFather on Telegram
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Channel ID (for notifications)
                </label>
                <input
                  type="number"
                  name="telegram_channel_id"
                  value={formData.telegram_channel_id || ''}
                  onChange={handleChange}
                  placeholder="-1001234567890"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-sm text-gray-500 mt-2">
                  Use @userinfobot to get your channel ID
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleTestTelegram}
                  disabled={testMutation.isPending || !formData.telegram_bot_token}
                  className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {testMutation.isPending ? 'Testing...' : '✓ Test Connection'}
                </button>
              </div>

              {testResult && (
                <div
                  className={`p-4 rounded-lg ${
                    testResult.ok
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}
                >
                  {testResult.message}
                </div>
              )}
            </div>
          </div>

          {/* Nova Poshta Section */}
          <div className="mb-8 pb-8 border-b">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">📦 Nova Poshta (Optional)</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  name="novaposhta_api_key"
                  value={formData.novaposhta_api_key || ''}
                  onChange={handleChange}
                  placeholder="Your Nova Poshta API key"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-sm text-gray-500 mt-2">
                  Get from developers.novaposhta.ua
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Merchant Name
                </label>
                <input
                  type="text"
                  name="novaposhta_merchant_name"
                  value={formData.novaposhta_merchant_name || ''}
                  onChange={handleChange}
                  placeholder="Your business name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Reservation Settings Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">⏱️ Reservation Settings</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reservation Timeout (minutes)
                </label>
                <select
                  name="reservation_timeout_minutes"
                  value={formData.reservation_timeout_minutes || 5}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={3}>3 minutes</option>
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                </select>
                <p className="text-sm text-gray-500 mt-2">
                  How long to hold a reserved product
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Confirmation Timeout (minutes)
                </label>
                <select
                  name="payment_timeout_minutes"
                  value={formData.payment_timeout_minutes || 10}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={20}>20 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                </select>
                <p className="text-sm text-gray-500 mt-2">
                  Deadline for customer payment confirmation
                </p>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex gap-4">
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {updateMutation.isPending ? 'Saving...' : '💾 Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}