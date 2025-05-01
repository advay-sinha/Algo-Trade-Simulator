import { useEffect } from "react";
import { useLocation } from "wouter";

export default function HomePage() {
  const [, navigate] = useLocation();

  // Redirect to dashboard
  useEffect(() => {
    navigate("/dashboard");
  }, [navigate]);

  return null;
}
