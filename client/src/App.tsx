import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { AdminLogin, AdminSetup } from "./pages/AdminAccess";
import { trpc } from "./lib/trpc";

function Router() {
  const setup = trpc.setup.status.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  if (setup.isLoading) return <div className="flex min-h-screen items-center justify-center bg-[#061527]"><div className="loading-ring" /></div>;
  if (setup.error) return <div className="flex min-h-screen items-center justify-center bg-[#061527] p-5 text-center text-white"><div><h1 className="text-xl font-black">Database belum siap</h1><p className="mt-2 text-sm text-slate-300">Periksa DATABASE_URL lalu jalankan migrasi database.</p></div></div>;
  if (!setup.data?.data.configured) return <AdminSetup />;
  if (!setup.data?.data.authenticated) return <AdminLogin />;
  return <Switch><Route path="/" component={Home} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

export default App;
