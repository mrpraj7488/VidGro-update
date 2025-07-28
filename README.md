# VidGro - Watch & Earn

A React Native Expo app for video promotion and monetization where users can watch videos to earn coins and promote their own YouTube videos.

## Features

- 🎥 Watch YouTube videos and earn coins
- 📈 Promote your own videos using coins
- 💰 VIP membership with discounts
- 📊 Analytics dashboard
- 🔐 Secure authentication with Supabase
- 📱 Cross-platform (iOS, Android, Web)

## Tech Stack

- **Framework**: React Native with Expo
- **Navigation**: Expo Router
- **Database**: Supabase
- **State Management**: Zustand
- **Styling**: StyleSheet (React Native)
- **Icons**: Lucide React Native

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   Create a `.env` file with your Supabase credentials:
   ```
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## Project Structure

```
├── app/                    # App screens and navigation
│   ├── (auth)/            # Authentication screens
│   ├── (tabs)/            # Main tab screens
│   └── _layout.tsx        # Root layout
├── components/            # Reusable components
├── contexts/              # React contexts
├── lib/                   # Utilities and configurations
├── store/                 # Zustand stores
├── supabase/             # Database migrations
├── types/                # TypeScript type definitions
└── utils/                # Helper functions
```

## License

Private project - All rights reserved