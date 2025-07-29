## CLIENT SIDE IMPROVEMENTS

### Tab Visibility Security Enhancement
Modify existing video player component to detect when user switches tabs or app goes to background. Add event listeners for visibility change and window blur events. When detected, automatically pause current playing video. When user returns to app tab, resume video from paused position. This prevents videos from playing in background tabs.

### Video Owner Content Filter
Update existing feed generation logic to exclude video owner's own promoted content from their personal feed. Add condition in feed filtering where current user ID does not match video owner ID. This ensures users don't see their own promoted videos in the main feed.

### Enhanced Video Statistics Display
Modify existing edit video screen to display engagement metrics from database. Add new UI elements showing total views, engagement duration in formatted time (convert seconds to minutes/hours), and engagement rate. Pull this data from existing videos table engagement_rate column and display real-time updates.

### Background Video Prevention Logic
Enhance existing video player with additional security checks that prevent video playback when app window loses focus. Implement automatic pause functionality that triggers on window blur events and resume on window focus events.

## DATABASE SERVER SIDE IMPROVEMENTS

### coin_transactions Table Modifications
Add new columns to existing coin_transactions table:
- view_count column (INT) to track individual video plays
- engagement_duration column (INT) to store viewing time in seconds  
- Add expires_at column with 60-second auto-expiry from creation time

### Auto-Deletion System Implementation
Create database event scheduler that runs every 60 seconds to automatically delete expired rows from coin_transactions table where expires_at timestamp has passed. This maintains table performance and saves storage space.

### videos Table Schema Extension
Add these columns to existing videos table:
- engagement_rate column (DECIMAL) to store calculated engagement metrics
- Update mechanism to receive data pushes from coin_transactions table

### Real-Time Data Push System
Create database triggers on coin_transactions table that automatically update videos table when new engagement or view data is inserted. Set up data flow where coin_transactions acts as temporary logging table that pushes aggregated data to permanent videos table columns.

### View Count Tracking Integration
Modify coin_transactions table to log every video play event with view count increment. Create automatic data transfer system that pushes view count data to videos table views_count column for permanent storage.

### Engagement Duration Calculation
Set up coin_transactions table to capture video engagement time for each viewing session. Create automatic calculation system that aggregates engagement data and pushes results to videos table engagement_rate column. System should calculate total engagement time and update videos table seamlessly.

### Promotion Queue Management
Modify existing promotion system to check view count criteria from coin_transactions table. When promoted video reaches specified view target, automatically exclude video from promotion queue until owner creates new promotion campaign.

### Database Performance Optimization
Add indexes to coin_transactions table for video_id, user_id, and expires_at columns to optimize query performance. Implement efficient cleanup process for auto-deletion system.

## INTEGRATION REQUIREMENTS

### Real-Time Data Synchronization
Ensure coin_transactions table data flows seamlessly to videos table through database triggers. Maintain real-time updates where engagement and view data immediately reflects in video statistics.

### Edit Video Screen Data Integration
Connect edit video screen interface to pull engagement metrics from videos table engagement_rate column. Display calculated engagement time by converting seconds to user-friendly format (hours/minutes/seconds).

### Promotion Campaign Logic
Integrate view count checking system that monitors promoted video performance against target criteria. Automatically remove videos from promotion feed when view targets are met.

### Storage Efficiency Management
Implement 60-second auto-deletion cycle for coin_transactions rows to maintain database efficiency while preserving necessary data transfer to permanent storage columns.

This enhancement maintains existing app functionality while adding specified tracking capabilities, security improvements, and database optimization features.