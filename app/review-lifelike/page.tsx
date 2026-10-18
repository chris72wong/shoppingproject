import { notFound } from "next/navigation";
import LifelikeReview from "@/components/LifelikeReview";
export default function ReviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <LifelikeReview />;
}
