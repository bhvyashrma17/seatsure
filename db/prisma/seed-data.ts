// Static reference data for the seed. Names and clubs are fictional but realistic for an Indian
// university campus. Emails use the reserved example.edu domain on purpose.

export const CLUBS = [
  { name: 'Coding Club', slug: 'coding-club', description: 'Competitive programming, open source and weekly build nights.' },
  { name: 'AI & ML Society', slug: 'ai-ml-society', description: 'Hands-on machine learning, paper reading groups and model jams.' },
  { name: 'Robotics & IoT Club', slug: 'robotics-iot', description: 'Microcontrollers, sensors and anything that moves or blinks.' },
  { name: 'Entrepreneurship Cell', slug: 'e-cell', description: 'Founder talks, pitch practice and startup weekends.' },
  { name: 'Design Collective', slug: 'design-collective', description: 'UI/UX critiques, Figma workshops and poster jams.' },
  { name: 'Literary & Debate Society', slug: 'literary-debate', description: 'Debates, open mics, MUN prep and creative writing.' },
  { name: 'Music Club', slug: 'music-club', description: 'Jam sessions, unplugged evenings and the annual band night.' },
  { name: 'Sports Council', slug: 'sports-council', description: 'Inter-department tournaments and fitness drives.' },
] as const;

export const VENUES = [
  { name: 'Main Auditorium', building: 'Central Block', capacity: 400 },
  { name: 'Seminar Hall A', building: 'Block A', capacity: 120 },
  { name: 'Seminar Hall B', building: 'Block B', capacity: 90 },
  { name: 'Innovation Lab 204', building: 'Tech Park', capacity: 40 },
  { name: 'Computer Lab 3', building: 'Block C', capacity: 60 },
  { name: 'Open Air Theatre', building: 'Campus Green', capacity: 250 },
  { name: 'Conference Room 1', building: 'Admin Block', capacity: 25 },
  { name: 'Indoor Sports Arena', building: 'Sports Complex', capacity: 150 },
] as const;

// One lead organiser per club (index = club index) plus a few co-organisers.
export const ORGANISERS = [
  { name: 'Aarav Mehta', department: 'Computer Science', year: 4, clubs: [0] },
  { name: 'Diya Nair', department: 'CSE (AI & Future Technologies)', year: 3, clubs: [1] },
  { name: 'Kabir Rao', department: 'Electronics & Communication', year: 3, clubs: [2] },
  { name: 'Ananya Iyer', department: 'Business Administration', year: 4, clubs: [3] },
  { name: 'Rohan Gupta', department: 'Design', year: 3, clubs: [4] },
  { name: 'Meera Krishnan', department: 'Liberal Arts', year: 2, clubs: [5] },
  { name: 'Arjun Reddy', department: 'Commerce', year: 3, clubs: [6] },
  { name: 'Ishita Banerjee', department: 'Physical Education', year: 4, clubs: [7] },
  { name: 'Vikram Joshi', department: 'Computer Science', year: 3, clubs: [0, 1] },
  { name: 'Sneha Pillai', department: 'Design', year: 2, clubs: [4, 6] },
] as const;

export const FIRST_NAMES = [
  'Priya', 'Rahul', 'Aditi', 'Karthik', 'Neha', 'Siddharth', 'Pooja', 'Aditya', 'Kavya', 'Nikhil',
  'Riya', 'Varun', 'Shreya', 'Manish', 'Tanvi', 'Harsh', 'Nandini', 'Yash', 'Simran', 'Akash',
  'Divya', 'Pranav', 'Isha', 'Gaurav', 'Anjali', 'Rohit', 'Sakshi', 'Kunal', 'Bhavana', 'Tarun',
  'Lakshmi', 'Abhinav', 'Mitali', 'Sameer', 'Deepika', 'Vivek', 'Aishwarya', 'Rajat', 'Zoya', 'Farhan',
];

export const LAST_NAMES = [
  'Sharma', 'Verma', 'Iyer', 'Reddy', 'Nair', 'Kulkarni', 'Das', 'Menon', 'Patel', 'Singh',
  'Chopra', 'Bose', 'Hegde', 'Shetty', 'Kapoor', 'Mishra', 'Agarwal', 'Pandey', 'Rao', 'Khan',
];

export const DEPARTMENTS = [
  'Computer Science',
  'CSE (AI & Future Technologies)',
  'Electronics & Communication',
  'Mechanical Engineering',
  'Business Administration',
  'Design',
  'Commerce',
  'Law',
];

type Question = { id: string; label: string; type: 'text' | 'select' | 'boolean'; required: boolean; options?: string[] };

const Q = {
  laptop: { id: 'laptop', label: 'Will you bring a laptop?', type: 'boolean', required: true },
  level: { id: 'level', label: 'Experience level', type: 'select', required: true, options: ['Beginner', 'Intermediate', 'Advanced'] },
  tshirt: { id: 'tshirt', label: 'T-shirt size', type: 'select', required: true, options: ['S', 'M', 'L', 'XL'] },
  diet: { id: 'diet', label: 'Food preference', type: 'select', required: true, options: ['Veg', 'Non-veg', 'Jain'] },
  team: { id: 'team', label: 'Team name (optional)', type: 'text', required: false },
  question: { id: 'question', label: 'A question for the speaker (optional)', type: 'text', required: false },
  instrument: { id: 'instrument', label: 'Instrument you play', type: 'select', required: true, options: ['Vocals', 'Guitar', 'Keys', 'Drums', 'Other'] },
} satisfies Record<string, Question>;

// dayOffset: days from "now" (negative = already happened). popularity: 0..1.6 demand multiplier.
export const EVENTS: {
  title: string; club: number; venue: number; category: 'WORKSHOP' | 'HACKATHON' | 'TALK' | 'COMPETITION' | 'CULTURAL' | 'SPORTS';
  dayOffset: number; hour: number; durationH: number; capacity: number; popularity: number; questions: Question[]; description: string;
  /** Overrides dayOffset/hour: starts this many hours after the seed runs (keeps a "today" event for the check-in demo). */
  startsInHours?: number;
}[] = [
  { title: 'Resume & LinkedIn Review Drop-in', club: 3, venue: 6, category: 'WORKSHOP', dayOffset: 0, hour: 0, startsInHours: 1, durationH: 3, capacity: 25, popularity: 0.9, questions: [Q.level], description: 'Bring your resume; alumni mentors review it live and fix your LinkedIn headline. Check-in at the door.' },
  { title: 'Git & GitHub Bootcamp for First Years', club: 0, venue: 4, category: 'WORKSHOP', dayOffset: -18, hour: 14, durationH: 3, capacity: 60, popularity: 1.1, questions: [Q.laptop, Q.level], description: 'From your first commit to your first pull request. Bring a laptop with Git installed.' },
  { title: 'Competitive Programming Contest: Round 1', club: 0, venue: 4, category: 'COMPETITION', dayOffset: -11, hour: 10, durationH: 3, capacity: 60, popularity: 0.9, questions: [Q.level], description: 'Two hours, six problems, one leaderboard. Individual participation.' },
  { title: 'Build Your Portfolio Website in an Afternoon', club: 0, venue: 4, category: 'WORKSHOP', dayOffset: 3, hour: 14, durationH: 3, capacity: 60, popularity: 1.4, questions: [Q.laptop, Q.level], description: 'HTML, CSS and a free deployment. Walk out with a live link to share with recruiters.' },
  { title: 'HackNight 24h Hackathon', club: 0, venue: 0, category: 'HACKATHON', dayOffset: 12, hour: 18, durationH: 24, capacity: 180, popularity: 1.3, questions: [Q.team, Q.tshirt, Q.diet], description: 'Overnight build sprint with mentors, snacks and prizes. Teams of up to four.' },
  { title: 'Open Source Contribution Sprint', club: 0, venue: 4, category: 'WORKSHOP', dayOffset: 20, hour: 15, durationH: 4, capacity: 50, popularity: 0.6, questions: [Q.laptop, Q.level], description: 'Pick a good-first-issue and ship a real contribution with help from maintainers.' },

  { title: 'Intro to Machine Learning with Python', club: 1, venue: 1, category: 'WORKSHOP', dayOffset: -15, hour: 11, durationH: 3, capacity: 120, popularity: 1.2, questions: [Q.laptop, Q.level], description: 'Regression, classification and your first notebook.' },
  { title: 'Hands-on Workshop: Building with LLM APIs', club: 1, venue: 3, category: 'WORKSHOP', dayOffset: 2, hour: 15, durationH: 3, capacity: 40, popularity: 1.6, questions: [Q.laptop, Q.level], description: 'Prompting, tool calls and a small chatbot you can extend. Limited lab seats.' },
  { title: 'Paper Reading Group: Attention Is All You Need', club: 1, venue: 6, category: 'TALK', dayOffset: 6, hour: 17, durationH: 2, capacity: 25, popularity: 1.4, questions: [Q.question], description: 'A guided walk through the transformer paper. No prior reading required.' },
  { title: 'Kaggle Weekend: Tabular Data Challenge', club: 1, venue: 4, category: 'COMPETITION', dayOffset: 16, hour: 10, durationH: 8, capacity: 60, popularity: 0.8, questions: [Q.team, Q.laptop], description: 'Form teams, climb the private leaderboard, present your approach.' },

  { title: 'Arduino Night: Build a Smart Plant Monitor', club: 2, venue: 3, category: 'WORKSHOP', dayOffset: 4, hour: 18, durationH: 3, capacity: 40, popularity: 1.5, questions: [Q.level], description: 'Soil sensors, an OLED display and a little C++. Kits provided.' },
  { title: 'Line Follower Robot Race', club: 2, venue: 7, category: 'COMPETITION', dayOffset: -6, hour: 10, durationH: 5, capacity: 80, popularity: 0.7, questions: [Q.team], description: 'Bring your bot. Fastest clean lap wins.' },
  { title: 'Drone Basics: Assembly and Safety', club: 2, venue: 3, category: 'WORKSHOP', dayOffset: 25, hour: 14, durationH: 4, capacity: 30, popularity: 1.3, questions: [Q.level], description: 'Frame, motors, flight controller and the rules of safe flying.' },

  { title: 'Founder Fireside: From Dorm Room to Seed Round', club: 3, venue: 0, category: 'TALK', dayOffset: -9, hour: 16, durationH: 2, capacity: 300, popularity: 0.8, questions: [Q.question], description: 'An alumni founder on early customers, co-founder fights and fundraising.' },
  { title: 'Pitch Practice Night', club: 3, venue: 2, category: 'WORKSHOP', dayOffset: 7, hour: 17, durationH: 3, capacity: 90, popularity: 0.5, questions: [Q.team], description: 'Three minutes, one slide deck, honest feedback from mentors.' },
  { title: 'Startup Weekend Campus Edition', club: 3, venue: 1, category: 'HACKATHON', dayOffset: 22, hour: 9, durationH: 30, capacity: 120, popularity: 1.0, questions: [Q.team, Q.tshirt, Q.diet], description: 'Pitch an idea on Friday, demo a product on Sunday.' },

  { title: 'Figma Fundamentals for Developers', club: 4, venue: 4, category: 'WORKSHOP', dayOffset: 5, hour: 13, durationH: 3, capacity: 60, popularity: 1.25, questions: [Q.laptop, Q.level], description: 'Frames, auto layout and handing designs to engineers.' },
  { title: 'UX Teardown: Campus Apps Edition', club: 4, venue: 6, category: 'TALK', dayOffset: -4, hour: 17, durationH: 2, capacity: 25, popularity: 1.3, questions: [Q.question], description: 'We critique the apps we all use every day, and redesign one live.' },
  { title: 'Poster Jam: Fest Branding', club: 4, venue: 2, category: 'CULTURAL', dayOffset: 10, hour: 15, durationH: 3, capacity: 90, popularity: 0.6, questions: [Q.laptop], description: 'Design the official poster for this year\'s cultural fest.' },

  { title: 'Inter-Department Debate Championship', club: 5, venue: 1, category: 'COMPETITION', dayOffset: -2, hour: 10, durationH: 6, capacity: 120, popularity: 0.9, questions: [Q.team], description: 'British Parliamentary format. Teams of two.' },
  { title: 'Open Mic: Poetry and Stories', club: 5, venue: 5, category: 'CULTURAL', dayOffset: 8, hour: 18, durationH: 3, capacity: 250, popularity: 0.7, questions: [], description: 'Five-minute slots. Sign up to perform or just come to listen.' },
  { title: 'Model UN Prep Session', club: 5, venue: 6, category: 'WORKSHOP', dayOffset: 14, hour: 16, durationH: 2, capacity: 25, popularity: 1.4, questions: [Q.level], description: 'Position papers, caucusing and speaking under pressure.' },

  { title: 'Unplugged Evening', club: 6, venue: 5, category: 'CULTURAL', dayOffset: -13, hour: 18, durationH: 3, capacity: 250, popularity: 0.8, questions: [], description: 'Acoustic sets under the stars.' },
  { title: 'Band Auditions', club: 6, venue: 2, category: 'CULTURAL', dayOffset: 9, hour: 14, durationH: 5, capacity: 90, popularity: 0.6, questions: [Q.instrument], description: 'Looking for vocalists, guitarists, keys and a drummer for band night.' },
  { title: 'Annual Band Night', club: 6, venue: 0, category: 'CULTURAL', dayOffset: 28, hour: 19, durationH: 4, capacity: 400, popularity: 1.2, questions: [], description: 'Five campus bands, one stage.' },

  { title: '5-a-side Football League: Kickoff', club: 7, venue: 7, category: 'SPORTS', dayOffset: -7, hour: 7, durationH: 4, capacity: 150, popularity: 0.9, questions: [Q.tshirt], description: 'Register individually; we will form balanced teams.' },
  { title: 'Badminton Doubles Open', club: 7, venue: 7, category: 'SPORTS', dayOffset: 11, hour: 8, durationH: 6, capacity: 64, popularity: 1.35, questions: [Q.team, Q.tshirt], description: 'Knockout format. Shuttles provided.' },
  { title: 'Campus Fitness Drive: 5K Fun Run', club: 7, venue: 5, category: 'SPORTS', dayOffset: 18, hour: 6, durationH: 2, capacity: 250, popularity: 0.7, questions: [Q.tshirt], description: 'Run, jog or walk. Every finisher gets a medal.' },
];
