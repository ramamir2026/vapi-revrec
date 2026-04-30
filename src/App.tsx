import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import Index from "./pages/Index";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Onboard from "./pages/Onboard";
import { StubPage } from "./pages/Stub";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
            <Route path="/customers/:customerId" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
            <Route path="/onboard" element={<ProtectedRoute><Onboard /></ProtectedRoute>} />
            <Route path="/closes" element={<ProtectedRoute><StubPage title="Monthly close" description="Run an AI-assisted close for a customer + period." /></ProtectedRoute>} />
            <Route path="/journal-entries" element={<ProtectedRoute><StubPage title="Journal entries" description="Browse, post, and reverse JEs." /></ProtectedRoute>} />
            <Route path="/exports" element={<ProtectedRoute><StubPage title="Exports" description="Universal CSV export of posted JEs." /></ProtectedRoute>} />
            <Route path="/audit" element={<ProtectedRoute><StubPage title="Audit log" description="Append-only history of every state change." /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><StubPage title="Settings" description="Roles, chart of accounts, profile." /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
