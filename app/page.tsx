
import { redirect } from "next/navigation";

export default function Home() {
  // Keep root route focused by sending users to the admin dashboard.
  // Redirect immediately to avoid rendering an empty landing page.
  redirect("/admin");
}