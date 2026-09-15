/* eslint-disable react-refresh/only-export-components */
import{StrictMode}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{Toaster}from'sonner';import{AuthProvider}from'@/providers/auth-provider';import{ThemeProvider,useTheme}from'@/providers/theme-provider';import{App}from'./App';import'./index.css'
const client=new QueryClient({defaultOptions:{queries:{staleTime:30_000,retry:1}}})
const registerPwa=()=>void import('virtual:pwa-register').then(({registerSW})=>registerSW({immediate:false}))
const idle=window.requestIdleCallback
if(typeof idle==='function')idle(registerPwa,{timeout:2000})
else window.addEventListener('load',()=>setTimeout(registerPwa,0),{once:true})
function AppToaster(){const{resolvedTheme}=useTheme();return <Toaster richColors position="top-center" theme={resolvedTheme}/>}
createRoot(document.getElementById('root')!).render(<StrictMode><ThemeProvider><BrowserRouter><QueryClientProvider client={client}><AuthProvider><App/><AppToaster/></AuthProvider></QueryClientProvider></BrowserRouter></ThemeProvider></StrictMode>)
