import { getAllCards } from "@/lib/api";
import LandingClient from "./LandingClient";

export default async function LandingPage() {
  const cards = await getAllCards();

  return <LandingClient initialCards={cards} />;
}
