# ER Consult Dashboard

## Overview

This is an Emergency Room (ER) consultation tracking system built for Maharaj Hospital (MNRH). The application allows ER staff to submit consultation requests to various surgical departments and track their status in real-time. The system displays pending consultations organized by department (Surgery and Orthopedics) on a centralized dashboard, enabling medical staff to monitor and manage patient consultations efficiently.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: Next.js 16 with React 19 and TypeScript
- **Rationale**: Next.js provides server-side rendering capabilities, file-based routing, and excellent developer experience. The App Router architecture enables modern React features including React Server Components.
- **Styling**: Tailwind CSS v4 with professional medical-themed design system using solid colors only (no gradients)
- **Design Philosophy**: Modern, trustworthy, compact aesthetic appropriate for emergency department use
- **Visual Identity**: Deep navy backgrounds for professionalism, coral accents for urgent items, green for success states, peach tones for secondary actions
- **Animations**: Smooth transitions, pulse effects for urgent cases, slide-in animations for content
- **Language Support**: Thai language support (lang="th") for local hospital staff
- **Compact Design**: Reduced spacing, padding, and element sizes throughout for efficient information density while maintaining readability

**Component Structure**:
- **Page Components**: 
  - Dashboard (`app/page.tsx`): Real-time dashboard with solid color theme, department filtering (Surgery/Ortho/Both toggles with coral/green/peach buttons), pending case counter with coral pulsing for active cases. **Quick Navigation**: Displays shortcut buttons for each Surgery department (Gen Sx, Sx Trauma, Neuro Sx, Sx Vascular, Sx Plastic, Uro Sx, CVT) showing case count; clicking scrolls smoothly to that department's section. Department displays in responsive 2-column grid (1 col mobile, 2 col on medium+) for optimal readability. Uses scalpel icon for Surgery (coral header) and bone icon for Ortho (green header). Light gray-blue card backgrounds with navy text. Performance optimized with query limit(30), useMemo for department filtering, and useRef for scroll targets. **Error handling**: Shows light-themed error screen with green reload button if Firebase connection fails.
  - Submit form (`app/submit/page.tsx`): Modern consultation submission form with solid color theme. Features dual submission buttons (normal green "Consult" and urgent coral "Consult FastTrack" with lightning icon) placed side-by-side, interactive department selection with green backgrounds for selected departments, and room/location field. Navy background with peach header and white input fields.
  - Completed cases (`app/completed/page.tsx`): Management page for completed consultations with solid color theme showing 100 latest cases in table format with pagination (25 cases per page). Features Re-consult functionality with **department selection** allowing staff to choose which departments to consult (can be different from original), add new problem details, and automatically return cases to pending status on the dashboard. Table uses coral header, gray-blue background, and navy text. Displays HN, room, problem (with line-clamp for long text), departments, and formatted timestamps. **Error handling**: Shows light-themed error screen with green reload button if Firebase connection fails.
- **Shared Components**: 
  - `ConsultCard`: Light-themed card with solid gray-blue background, patient icon, status badges, room location, and hover lift effects with glow. Regular cases display green accent border; urgent cases display coral border with pulsing glow effect, coral icon with lightning bolt, and "ด่วน" (urgent) badge. **Multi-department display**: Shows other consulted departments in navy blue underlined text below the main department. **Accept behavior**: "รับเคส" (Accept Case) button accepts the case for departments in the SAME CATEGORY only - clicking accept in any Surgery department (Gen Sx, Sx Trauma, Neuro Sx, Sx Vascular, Sx Plastic, Uro Sx, CVT) accepts ALL Surgery departments simultaneously; Ortho accepts only Ortho. Stores acceptedAt timestamp for all accepted departments in Firestore. **Close behavior**: "ปิดเคส" (Close Case) button closes only the specific department shown on the card, uses solid coral background. **Card sorting**: Urgent cases always appear first, sorted by creation time (oldest first) within urgent/normal groups.
- **Layout**: Compact sticky navigation bar with solid coral logo, navy background, "จัดการเคส" (completed cases) link with gray-blue button, and prominent green submit button

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
        acceptedAt: timestamp | null
      }
```

**Department Categories**:
- Surgery Departments: Gen Sx, Sx Trauma, Neuro Sx, Sx Vascular, Sx Plastic, Uro Sx, CVT
- Orthopedic Department: Ortho

**Query Pattern**: Cases filtered by overall status "pending" and ordered by creation time (newest first), limited to 30 most recent cases for performance. Client-side filtering uses memoized map for department-specific views with custom sorting: urgent cases always appear first, then normal cases, each group sorted by creation time (oldest first).

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
  - Solid color backgrounds (NO gradients)
  - Enhanced card shadows with subtle glow effects
  - Pulse animation for urgent case indicators with coral glow
  - Slide-in animations for smooth content loading
  - Glow-hover effects with soft highlights
- **Color Palette**: Clean modern palette with SOLID COLORS ONLY (no gradients)
  - **Primary Background**: #014167 (deep navy) - main page backgrounds, navigation
  - **Secondary Background**: #C7CFDA (gray-blue) - cards, secondary surfaces
  - **Primary Text on Dark**: #FDFCDF (cream) - text on navy backgrounds
  - **Primary Text on Light**: #014167 (navy) - text on light backgrounds
  - **Urgent/Alert**: #E55143 (coral) - urgent cases, alerts, Surgery department, FastTrack button
  - **Success/Accept**: #699D5D (green) - success states, accept buttons, Ortho department, normal submit
  - **Accent Peach**: #F1AE9E (peach) - secondary actions, medium accents
  - **Accent Peach Light**: #FBD8C5 (peach light) - soft accents
  - **Success Light**: #B4C8AB (green light) - soft success states
  - **Warning/Highlight**: #F4ECA3 (yellow light) - warnings, highlights
  - **Design Rationale**: Professional medical theme with clean solid colors, coral for urgent visibility, green for positive actions, navy backgrounds for trust and professionalism
- **Typography**: Inter font family with antialiasing for crisp text rendering
- **Responsive Design**: Mobile-first approach with tablet and desktop breakpoints
- **Grid Layout**: Dashboard uses 2-column grid (md:grid-cols-2) for efficient space utilization

**Next.js Font Optimization**: 
- Inter font family from Google Fonts
- Automatic font optimization and subsetting for Latin characters

### Development Tools

- **TypeScript (v5)**: Static typing for improved code quality and developer experience
- **ESLint (v9)**: Code linting with Next.js-specific configuration
- **@types packages**: Type definitions for Node.js, React, and React DOM