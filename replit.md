# ER Consult Dashboard

## Overview

This is an Emergency Room (ER) consultation tracking system built for Maharaj Hospital (MNRH). The application allows ER staff to submit consultation requests to various surgical departments and track their status in real-time. The system displays pending consultations organized by department (Surgery and Orthopedics) on a centralized dashboard, enabling medical staff to monitor and manage patient consultations efficiently.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: Next.js 16 with React 19 and TypeScript
- **Rationale**: Next.js provides server-side rendering capabilities, file-based routing, and excellent developer experience. The App Router architecture enables modern React features including React Server Components.
- **Styling**: Tailwind CSS v4 with professional medical-themed design system
- **Design Philosophy**: Modern, trustworthy, compact aesthetic appropriate for emergency department use
- **Visual Identity**: Blue gradients for trust and professionalism, emerald green for success states, red for urgent items
- **Animations**: Smooth transitions, pulse effects for urgent cases, slide-in animations for content
- **Language Support**: Thai language support (lang="th") for local hospital staff
- **Compact Design**: Reduced spacing, padding, and element sizes throughout for efficient information density while maintaining readability

**Component Structure**:
- **Page Components**: 
  - Dashboard (`app/page.tsx`): Real-time dashboard with Nautical Red theme, department filtering (Surgery/Ortho/Both toggles with red/cream/gradient buttons), pending case counter with red pulsing for active cases. Department displays in responsive 2-column grid (1 col mobile, 2 col on medium+) for optimal readability. Uses scalpel icon for Surgery (red gradient header) and bone icon for Ortho (cream gradient header). Dark navy card backgrounds with cream text. Performance optimized with query limit(30) and useMemo for department filtering. **Error handling**: Shows dark-themed error screen with cream reload button if Firebase connection fails.
  - Submit form (`app/submit/page.tsx`): Modern consultation submission form with Nautical Red theme. Features dual submission buttons (normal cream "Consult" and urgent red "Consult FastTrack" with lightning icon) placed side-by-side, interactive department selection with cream gradient for selected departments, and room/location field. Navy background with cream header and dark input fields.
  - Completed cases (`app/completed/page.tsx`): Management page for completed consultations with Nautical Red theme showing 100 latest cases in table format with pagination (25 cases per page). Features Re-consult functionality with **department selection** allowing staff to choose which departments to consult (can be different from original), add new problem details, and automatically return cases to pending status on the dashboard. Table uses red gradient header, navy background, and cream text. Displays HN, room, problem (with line-clamp for long text), departments, and formatted timestamps. **Error handling**: Shows dark-themed error screen with cream reload button if Firebase connection fails.
- **Shared Components**: 
  - `ConsultCard`: Nautical-themed card with gradient background (navy to darker navy), patient icon, status badges, room location, and hover lift effects with glow. Regular cases display cream accent border; urgent cases display red border with pulsing glow effect, red icon with lightning bolt, and "ด่วน" (urgent) badge. **New Feature**: "รับเคส" (Accept Case) button with cream gradient allows staff to acknowledge case reception, stores acceptedAt timestamp in Firestore. "ปิดเคส" (Close Case) button uses red gradient.
- **Layout**: Compact sticky navigation bar with red gradient logo, nautical gradient background, "จัดการเคส" (completed cases) link with navy button, and prominent cream gradient submit button

**State Management**:
- Local React state with `useState` for form inputs and UI controls
- Real-time data subscription using Firebase Firestore's `onSnapshot` listener with limit(30) for performance
- Memoized department case filtering with `useMemo` to prevent redundant calculations on every render
- No additional state management library needed due to simple data flow

**Design Patterns**:
- Client Components (marked with "use client") for interactive features requiring hooks
- Real-time listeners for live dashboard updates without manual refresh
- **Error boundaries**: onSnapshot error callbacks handle Firebase connection failures gracefully with user-friendly error screens and reload functionality
- Conditional rendering based on consultation status and department filters
- Performance optimizations: query limits, memoized calculations, efficient re-render patterns
- **Form validation**: Multi-level validation for re-consult (requires problem text AND at least one department selected)

### Backend Architecture

**Database**: Firebase Firestore (NoSQL cloud database)
- **Rationale**: Firestore provides real-time synchronization, offline support, and serverless architecture, eliminating the need for backend server management
- **Pros**: Real-time updates, automatic scaling, built-in security rules, no server maintenance
- **Cons**: Vendor lock-in, pricing at scale, limited complex query capabilities

**Data Model**:
```
consults collection:
  - id (auto-generated)
  - hn (patient hospital number)
  - room (examination room: "Resus Team 1" | "Resus Team 2" | "Resus Team 3" | "Resus Team 4" | "Urgent" | "NT")
  - problem (consultation description)
  - status (overall case status: "pending")
  - isUrgent (boolean: true for urgent cases submitted via red button, false for normal cases)
  - createdAt (server timestamp)
  - departments (map object):
      [departmentName]: {
        status: "pending" | "completed"
        completedAt: timestamp | null
      }
```

**Department Categories**:
- Surgery Departments: Gen Sx, Sx Trauma, Neuro Sx, Sx Vascular, Sx Plastic, Uro Sx, CVT
- Orthopedic Department: Ortho

**Query Pattern**: Cases filtered by overall status "pending" and ordered by creation time (newest first), limited to 30 most recent cases for performance. Client-side filtering uses memoized map for department-specific views.

**Important**: A Firestore composite index on (status asc, createdAt desc) should be created in Firebase Console for optimal query performance. Without this index, queries may be slower or fail at scale.

### Authentication & Authorization

**Current State**: No authentication implemented
- The application currently has no user authentication or role-based access control
- All users can submit and view all consultations
- **Future Consideration**: May need to implement Firebase Authentication for user management and department-specific access controls

### Development & Deployment

**Development Server**: Configured to run on port 5000 and listen on all network interfaces (0.0.0.0) for accessibility within hospital network

**Build Configuration**:
- TypeScript with strict mode enabled
- Path aliases (@/* for root imports)
- ESLint for code quality
- React 19 with new JSX transform (react-jsx)

**Deployment Target**: Designed for Vercel platform deployment with Next.js optimization

## External Dependencies

### Third-Party Services

**Firebase (v12.5.0)**:
- **Firestore Database**: Real-time NoSQL database for storing consultation records
- **Configuration**: Uses environment variables for secure credential management:
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
- **Initialization**: Singleton pattern to prevent multiple Firebase app instances

### UI Libraries

**Tailwind CSS (v4)**: Utility-first CSS framework with PostCSS integration for styling
- **Custom CSS**: Professional design utilities in `globals.css` including:
  - Nautical gradient backgrounds (navy to black spectrum)
  - Enhanced card shadows with red accent glow effects
  - Pulse animation for urgent case indicators with red glow
  - Slide-in animations for smooth content loading
  - Glow-hover effects with cream highlights
- **Color Palette**: Nautical Red theme optimized for professional medical aesthetics
  - **Background**: #000000 (black) transitioning to #2a344f (deep navy)
  - **Primary Text**: #e0cda7 (cream) for excellent contrast on dark backgrounds
  - **Accent Red**: #bb1515 (nautical red) for urgent items, primary alerts, Surgery department headers
  - **Accent Cream**: #e0cda7 (cream beige) for success states, secondary actions, Ortho department headers
  - **Secondary Gray**: #8b8b8b (gray) for secondary text and borders
  - **Design Rationale**: Professional nautical-inspired dark theme reduces eye strain in low-light emergency room environments while red accents ensure critical urgent cases are immediately visible
  - **Custom Gradients**: accent-gradient-red, accent-gradient-cream, nautical-gradient for consistent visual identity
- **Typography**: Inter font family with antialiasing for crisp text rendering on dark backgrounds
- **Responsive Design**: Mobile-first approach with tablet and desktop breakpoints
- **Grid Layout**: Dashboard uses 2-column grid (md:grid-cols-2) for efficient space utilization

**Next.js Font Optimization**: 
- Inter font family from Google Fonts
- Automatic font optimization and subsetting for Latin characters

### Development Tools

- **TypeScript (v5)**: Static typing for improved code quality and developer experience
- **ESLint (v9)**: Code linting with Next.js-specific configuration
- **@types packages**: Type definitions for Node.js, React, and React DOM