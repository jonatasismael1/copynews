import{StrictMode}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{Toaster}from'sonner';import{registerSW}from'virtual:pwa-register';import{AuthProvider}from'@/providers/auth-provider';import{App}from'./App';import'./index.css'
const client=new QueryClient({defaultOptions:{queries:{staleTime:30_000,retry:1}}})
registerSW({immediate:true})
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><QueryClientProvider client={client}><AuthProvider><App/><Toaster richColors position="top-center"/></AuthProvider></QueryClientProvider></BrowserRouter></StrictMode>)
