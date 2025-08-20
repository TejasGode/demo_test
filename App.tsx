import React, { useState } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import type { View } from './types';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [dashboardKey, setDashboardKey] = useState(Date.now());

  const refetchInvoices = () => {
    // When sync is successful from the Settings page, switch to the dashboard.
    // We also update the key on the Dashboard component to ensure it fully
    // remounts and its useInvoices hook re-runs from scratch.
    setDashboardKey(Date.now());
    setActiveView('dashboard');
  };


  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-800">
      <Header activeView={activeView} setActiveView={setActiveView} />
      <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {activeView === 'dashboard' && <Dashboard key={dashboardKey} setActiveView={setActiveView} />}
        {activeView === 'settings' && <Settings onSync={refetchInvoices} />}
      </main>
    </div>
  );
};

export default App;
