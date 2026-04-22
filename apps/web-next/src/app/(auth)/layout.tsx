import { V2Footer } from "@/components/landing-v2/Chrome";
import "../landing.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-v2 auth-v2">
      {children}
      <V2Footer />
    </div>
  );
}
