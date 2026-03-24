import { VideoAccessPanel } from "@/components/video-access-panel";

type SessionPageProps = {
  params: Promise<{
    consultationId: string;
  }>;
};

export default async function SessionPage({ params }: SessionPageProps) {
  const { consultationId } = await params;

  return <VideoAccessPanel consultationId={consultationId} />;
}
