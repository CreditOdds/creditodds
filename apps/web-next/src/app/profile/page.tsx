import { getAllCards } from "@/lib/api";
import { getNews } from "@/lib/news";
import ProfileClient from "./ProfileClient";

// Prefetch public data server-side for faster initial load
export default async function ProfilePage() {
  // Fetch public data in parallel on the server
  const [cards, news] = await Promise.all([
    getAllCards(),
    getNews(),
  ]);

  return <ProfileClient initialCards={cards} initialNews={news} />;
}
