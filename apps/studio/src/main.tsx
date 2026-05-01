import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { Toaster } from 'sonner';

import { wagmiConfig } from './lib/wagmi';
import App from './App';
import { StarryBackground } from './components/StarryBackground';
import Landing from './routes/Landing';
import Mint from './routes/Mint';
import AgentsList from './routes/AgentsList';
import AgentDetail from './routes/AgentDetail';
import Market from './routes/Market';
import Demo from './routes/Demo';

import '@rainbow-me/rainbowkit/styles.css';
import './styles.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: '#f97316' })}>
          <StarryBackground />
          <BrowserRouter>
            <Routes>
              <Route element={<App />}>
                <Route path="/" element={<Landing />} />
                <Route path="/mint" element={<Mint />} />
                <Route path="/agents" element={<AgentsList />} />
                <Route path="/agents/:tokenId" element={<AgentDetail />} />
                <Route path="/market" element={<Market />} />
                <Route path="/demo" element={<Demo />} />
              </Route>
            </Routes>
          </BrowserRouter>
          <Toaster theme="dark" position="bottom-right" />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
