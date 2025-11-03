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
- **Design Philosophy**: Modern, trustworthy aesthetic appropriate for emergency department use
- **Visual Identity**: Blue gradients for trust and professionalism, emerald green for success states, red for urgent items
- **Animations**: Smooth transitions, pulse effects for urgent cases, slide-in animations for content
- **Language Support**: Thai language support (lang="th") for local hospital staff

**Component Structure**:
- **Page Components**: 
  - Dashboard (`app/page.tsx`): Real-time dashboard with department filtering, pending case counter, and professional loading states
  - Submit form (`app/submit/page.tsx`): Modern consultation submission form with interactive department selection
- **Shared Components**: 
  - `ConsultCard`: Enhanced card design with patient icon, status badges, blue accent border, and hover lift effects
- **Layout**: Professional sticky navigation bar with branded logo, gradient background, and prominent submit button

**State Management**:
- Local React state with `useState` for form inputs and UI controls
- Real-time data subscription using Firebase Firestore's `onSnapshot` listener
- No additional state management library needed due to simple data flow

**Design Patterns**:
- Client Components (marked with "use client") for interactive features requiring hooks
- Real-time listeners for live dashboard updates without manual refresh
- Conditional rendering based on consultation status and department filters

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
  - problem (consultation description)
  - status (overall case status: "pending")
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

**Query Pattern**: Cases filtered by overall status "pending" and ordered by creation time (newest first), with client-side filtering for department-specific views

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
  - Emergency gradient backgrounds (blue spectrum)
  - Card shadow effects with hover states
  - Pulse animation for urgent case indicators
  - Slide-in animations for smooth content loading
- **Color Palette**: Medical-themed colors (emergency blue, trust green, urgent red/orange)
- **Typography**: Inter font family with antialiasing for crisp text rendering
- **Responsive Design**: Mobile-first approach with tablet and desktop breakpoints

**Next.js Font Optimization**: 
- Inter font family from Google Fonts
- Automatic font optimization and subsetting for Latin characters

### Development Tools

- **TypeScript (v5)**: Static typing for improved code quality and developer experience
- **ESLint (v9)**: Code linting with Next.js-specific configuration
- **@types packages**: Type definitions for Node.js, React, and React DOM