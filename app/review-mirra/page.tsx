import { notFound } from "next/navigation";
import MirraReview from "@/components/MirraReview";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MirraReview />;
}
