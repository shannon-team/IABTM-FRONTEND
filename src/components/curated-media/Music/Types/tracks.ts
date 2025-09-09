export type Track = {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: string;
  // optional fields used in components
  img?: string;
  author?: string;
};
