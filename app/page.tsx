import Image from "next/image";
import Link from "next/link";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

const features = [
  {
    title: "Rankings",
    description:
      "View up to date team Elo ratings for each individual map.",
    image: "/images/web/Rankings.PNG",
    link: "/rankings",
  },
  {
    title: "Match Predictions",
    description:
      "Explore match predictions for any match up using the implied win probabilities from our Elo rating system. Create custom map pools for a match up and see how we expect each team to fare. Use our Auto Map Selection feature to automatically select the maps that would be played if each team selected optimally in accordance with our calculated win probabilities.",
    image: "/images/web/Predictions.PNG",
    link: "/predictions",
  },
  {
    title: "Map Pools",
    description:
      "Compare the strength of any teams map pools using our Elo rating system.",
    image: "/images/web/Pools.PNG",
    link: "/map-stats",
  },
  {
    title: "Player Ratings",
    description:
      "View detailed Elo ratings for every player. See how players stack up against each other on different maps and agents.",
    image: "/images/maps/bind_image.PNG",
    link: "/player-ratings",
  },
  {
    title: "Elo History",
    description:
      "Track the Elo rating history of your favorite teams. Visualize their performance over time with interactive charts.",
    image: "/images/maps/haven_image.PNG",
    link: "/history",
  },

];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 lg:p-12 bg-gray-50 dark:bg-gray-900">
      <div className="text-center mb-12">
        <Logo className="text-4xl md:text-5xl lg:text-6xl mb-4" />
        <p className="text-lg md:text-xl lg:text-2xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
          Explore in-depth statistics, predictions, and rankings from the
          Valorant competitive scene.
        </p>
      </div>

      <Carousel
        opts={{
          align: "start",
          loop: true,
        }}
        className="w-full max-w-2xl"
      >
        <CarouselContent>
          {features.map((feature, index) => (
            <CarouselItem key={index}>
              <div className="p-1 h-full">
                <Card className="h-full flex flex-col">
                  <CardContent className="relative aspect-video w-full">
                    <Image
                      src={feature.image}
                      alt={feature.title}
                      fill
                      className="rounded-t-lg object-cover"
                    />
                  </CardContent>
                  <div className="p-6 flex flex-col flex-grow">
                    <h3 className="text-2xl font-semibold mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-gray-700 dark:text-gray-300 mb-4 flex-grow">
                      {feature.description}
                    </p>
                    <Link href={feature.link} passHref>
                      <Button className="w-full">
                        Go to {feature.title}
                      </Button>
                    </Link>
                  </div>
                </Card>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </main>
  );
}
