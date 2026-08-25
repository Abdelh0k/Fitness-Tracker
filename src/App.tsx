import { Component, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Activity,
  Apple,
  Beef,
  Bike,
  Camera,
  Carrot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Drumstick,
  Dumbbell,
  Egg,
  Eye,
  EyeOff,
  Fish,
  Flame,
  Footprints,
  Home,
  Loader2,
  LogOut,
  Milk,
  Plus,
  Save,
  Search,
  Settings,
  Trash2,
  Utensils,
  Weight,
  Wheat,
  X
} from 'lucide-react';
import { calculateTargets, defaultProfile, mealTypes, scaleNutrients, seedFoods, sumNutrients } from './lib/nutrition';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import Onboarding from './Onboarding';
import { loadLocal, prettyDate, saveLocal, todayKey, uid, type LocalState } from './lib/store';
import type {
  BodyMetric,
  CardioEntry,
  Food,
  MealEntry,
  MealType,
  ProgressPhoto,
  SavedMeal,
  StepEntry,
  StrengthExercise,
  StrengthSession,
  ProgramDay,
  TrainingProgram,
  UserProfile
} from './types';

type Tab = 'today' | 'food' | 'training' | 'cardio' | 'progress' | 'profile';
type ProgressRange = 'week' | 'month';

const templateSeeds: Record<string, string[]> = {
  Push: [
    'Bench Press', 'Incline Barbell Press', 'Decline Bench Press', 'Overhead Press', 'Arnold Press',
    'Incline Dumbbell Press', 'Dumbbell Shoulder Press', 'Chest Fly', 'Cable Crossover', 'Push-Up',
    'Dips', 'Lateral Raise', 'Front Raise', 'Rear Delt Fly', 'Triceps Pushdown',
    'Overhead Triceps Extension', 'Skull Crushers', 'Close-Grip Bench Press'
  ],
  Pull: [
    'Deadlift', 'Barbell Row', 'Pendlay Row', 'T-Bar Row', 'Seated Cable Row',
    'Lat Pulldown', 'Pull-Up', 'Chin-Up', 'Single-Arm Dumbbell Row', 'Face Pull',
    'Shrugs', 'Barbell Curl', 'EZ Bar Curl', 'Dumbbell Curl', 'Hammer Curl',
    'Preacher Curl', 'Concentration Curl', 'Cable Curl'
  ],
  Legs: [
    'Back Squat', 'Front Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Extension',
    'Leg Curl', 'Walking Lunge', 'Bulgarian Split Squat', 'Hip Thrust', 'Glute Bridge',
    'Standing Calf Raise', 'Seated Calf Raise', 'Hack Squat', 'Goblet Squat', 'Step-Up'
  ],
  Upper: [
    'Bench Press', 'Barbell Row', 'Overhead Press', 'Lat Pulldown', 'Incline Dumbbell Press',
    'Seated Cable Row', 'Lateral Raise', 'EZ Bar Curl', 'Triceps Pushdown', 'Face Pull',
    'Pull-Up', 'Dips'
  ],
  Lower: [
    'Back Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Extension', 'Leg Curl',
    'Bulgarian Split Squat', 'Hip Thrust', 'Walking Lunge', 'Standing Calf Raise',
    'Seated Calf Raise', 'Glute Bridge', 'Front Squat'
  ]
};

const exerciseLibrary: string[] = [
  // Chest
  'High Low Cable Chest Fly', 'Reverse Wrist Push-Up', 'Barbell Floor Press', 'Standing Cable Low Chest Press', 'Incline Barbell Bench Press',
  'Superman Push-Up', 'Korean Dip', 'Low Cable Incline Bench Press', 'Standing Cable Chest Press', 'Knuckle Push-Up',
  'Cable Kneeling High To Low Fly', 'One-Arm Cable Fly', 'Jack Push-Up', 'Punching Bag Boxing', 'Standing Downward Dog',
  'Planche Dips', 'Deep Push Up On Parallel Bars', 'Low Incline Dumbbell Fly', 'One-Arm Push-Up', 'Straight Bar Dips',
  'Scapula Push-Up', 'One-Arm Low Fly Dumbbell', 'Close Grip Dumbbell Press', 'Cable Middle Chest Fly', 'Svend Press',
  'Floor Dumbbell Press', 'Decline Push-Up', 'Smith Bench Press', 'Dumbbell Larsen Press', 'Negative Push-Up',
  'Incline Dumbbell Bench Press', 'Dumbbell Floor Chest Fly', 'Barbell Pullover', 'Pec Deck Chest Fly', 'Hammer Grip Dumbbell Bench Press',
  'Dumbbell Poliquin Press', 'Decline Barbell Bench Press', 'Push-Up', 'Seated Cable Fly', 'Band Bench Chest Press',
  'Incline Neutral Grip Dumbbell Press', 'Kneeling Ring Push-Up', 'Band Chest Fly', 'Decline Cable Chest Press', 'Band Warm-Up Dynamic Shoulder Stretch',
  'Suspension Chest Fly', 'Spoto Press', 'Barbell Bench Press with Chains', 'Kneeling Back Rotation Stretch', 'One-Arm Dumbbell Incline Bench Press',
  'Barbell Larsen Press', 'Incline Dumbbell Chest Fly', 'Machine Chest Press', 'Decline Chest Press', "World's Greatest Stretch",
  'Lying Cable Fly', 'Resistance Band Push-Up', 'Clap Push-Up', 'Standing Incline Band Chest Fly', 'One-Arm High-to-Low Cable Fly',
  'Archer Push-Up', 'Doorway Chest Stretch', 'Dumbbell Bench Press', 'Incline Hammer Chest Press', 'Lean Planche',
  'Cross Body One-Arm Strength Press', 'Chest Dips', 'Kettlebell One Arm Floor Press', 'Standing Press Around', 'Elbow Out Chest Stretch',
  'Lying Chest Press', 'Shoulder Tap', 'Seated Cable Chest Press', 'Ring Push-Up', 'One-Arm Dumbbell Bench Press',
  'Kneeling Wide Push-Up', 'Decline Dumbbell Bench Press', 'Wide Hand Push-Up', 'Push-Up on Parallel Bars', 'Bench Press With Resistance Band',
  'Pin Bench Press', 'One-Arm Low-to-High Cable Fly', 'Machine Chest Press Hammer Grip', 'Decline Smith Bench Press', 'Standing Chest Opener',
  'Seated Chest Clam', 'Machine Chest Fly', 'Barbell Bench Press', 'Dumbbell Low to High Fly', 'Bent Arm Chest Stretch',
  'Knee Push-Up', 'Low High Cable Chest Fly', 'Finger Push-Up', 'Decline Dumbbell Fly', 'Smith Incline Chest Press',
  'Incline Push-Up', 'Cable Bench Press', 'Weighted Push-Up', 'Dumbbell Chest Fly', 'Poliquin Flyes',
  'Dumbbell Deep Push Up', 'Incline Bench Cable Fly',
  // Back
  'One-Arm Lat Pulldown', 'Pull-Up', 'Weighted Pull-Up', 'One-Arm Dumbbell Bent Over Scapula Row', 'Close Grip Pull Up',
  'Barbell Bent Over Row', 'One-Arm Cable Low Row', 'Seated Cable Wide Grip Row', 'Seated Cable Row', 'Rope Straight-Arm Lat Pulldown',
  'Cable Wide Grip Behind Neck Pulldown', 'Wide Grip Rear Pull-Up', 'Chin-Up', 'Pull-Up Wide Grip', 'Suspension Row',
  'Barbell Bent Over Row From Pin', 'One-Arm Straight-Arm Cable Lat Pulldown', 'Dumbbell Kelso Shrugs', 'One-Arm Chest Supported Row Machine', 'Cable Neutral Grip Lat Pulldown',
  'One-Arm Low Cable Seated Row', 'Front Lever Pull-Up', 'Neck Side Stretch', 'Cable Lat Pulldown', 'Bent Over Kettlebell Row',
  'Machine Shrugs', 'Wide Grip Chest Supported Row', 'Gorilla Row', 'Band Bent Over Lat Pulldown', 'Suspension Inverted Row',
  'T-Bar Bent Over Row', 'Incline Bench Dumbbell Wide Row', 'Barbell Shrug Behind The Back', 'Dumbbell Bent Over Row', 'Machine Pullover',
  'T-Bar Chest Suported Row', 'Wide Grip Lat Pulldown', 'Dumbbell Seal Row', 'Dumbbell Shoulder Shrugs', 'L Pull-Up',
  'Seated Dumbbell Shrugs', 'Standing Side Lat Stretch', 'Pull Around', 'Cable Thibaudeau Kayak Row', 'One-Arm Landmine Bent Over Row',
  'One-Arm Cable Half-Kneeling Lat Pulldown', 'One-Arm Band Kneeling Lat Pulldown', 'Australian Pull-Up Underhand Grip', 'Lever Low Row', 'Pull-Up Neutral Grip',
  'Prone Swimmer', 'Smith Shoulder Shrug', 'Dip Shrugs', 'Chest Supported Machine Row', 'Band Pulldown Behind Neck',
  'Rings Pull-Up', 'Rowing Machine', 'Seal Row', 'Alternate Renegade Row', 'One-Arm High Row Cable',
  'Neck Curl', 'Ski Ergometer', 'Dumbbell Neutral Grip Incline Bench Row', 'Cable Close Grip Lat Pulldown', 'Barbell Shoulder Shrug',
  'Flag', 'Barbell Reverse Grip Bent Over Row', 'Lat Pulldown Machine', 'Band High Anchor Wide Row', 'Cable Reverse Grip Pulldown',
  'Incline Chest Supported Barbell Row', 'Kettlebel Renegade Row', 'Assisted Pull-Up', 'Barbell Rear Delt Row', 'Cable Seated Row Neutral Grip',
  'One-Arm Cable Row', 'Lever High Row', 'Trap Bar Shrugs', 'Inverted Row (Australian)', 'Pendlay Row',
  'Seated Cable Low Row Neutral Grip', 'Lever Back Extension', 'Dumbbell Pullover with Legs Raised', 'Cable Seated Supine Grip Row', 'Straight-Arm Lat Pulldown',
  'Kneeling Cable Lat Pulldown', 'Narrow Grip Australian Pull-Up With Rings', 'Close Grip Landmine Row', 'Back Lever', 'One-Arm Seated Row',
  'Cable Shrug', 'Barbell Incline Wide Grip Row', 'Band Assisted Pull Up', 'Inverted Shrug', 'Dumbbell Lat Pullover',
  'Dumbbell Incline Chest Supported Lateral Raises', 'Front Lever', 'One-Arm Lever High Row', 'Negative Pull-Up', 'Smith Bent Over Row',
  'Double Dumbbell Bent Over Row',
  // Shoulders
  'Barbell Behind Neck Shoulder Press', 'Dumbbell Push Press', 'Band Shoulder Press', 'Plate Front Raise Drive', 'Arm Circles',
  'Dumbbell Front Raise', 'Cable Front Raise', 'One-Arm Cable Lateral Raise', 'Dumbbell Seated Lateral Raise', 'Barbell Push Press',
  'Straddle Planche', 'Seated Cuban Press', 'One-Arm Shoulder Press Dumbbell', 'One-Arm Cable Front Raise', 'Bent Over Dumbbell Lateral Raise',
  'Barbell Overhead Press', 'Lever Seated Hammer Grip Shoulder Press', 'Pike Push-Up Between Benches', 'Cable Upright Row', 'Lateral to Front Raise',
  'Dumbbell Incline T Raise', 'Cable Supinated Face Pull', 'Dumbbell Cuban Rotation', 'Seated Face Pull', 'Kettlebell Around the Head Rotation',
  'Standing Dumbbell Shoulder Press', 'Lying Cable Face Pull', 'Full Planche', 'Medicine Ball Slam', 'Pike Push-Up Between Chairs',
  'Cable Face Pull', 'Barbell Wide Grip Upright Row', 'Seated Dumbbell Shoulder Press', 'Machine Reverse Flyes', 'One-Arm Landmine Standing Shoulder Press',
  'Dumbbell Half Kneeling Shoulder Press', 'Half Kneeling Shoulder Dumbbell Press', 'Barbell Narrow Grip Upright Row', 'Machine Shoulder Press', 'Band Pass Through Shoulders',
  'Weighted Woodchopper', 'Dumbbell Upright Row', 'Lying Cross Lateral Cable Fly', 'Static Front Hold', 'Kettlebell Clean and Jerk',
  'Dumbbell Alternate Hammer Front Raise', 'Seated Shoulder External Rotation', 'Plate Bus Driver', 'Pike Push-Up', 'Ring Face Pull',
  'Smith Seated Behind Neck Press', 'Incline Powell Raise', 'Standing Cuban Press', 'Barbell Shoulder Grip Upright Row', 'One-Arm Rear Delt Fly',
  'Cable Rear Delt Fly (Reverse Fly)', 'Arm Circle', 'Dumbbell Seated Bent Over High Row', 'One-Arm Cable Bent Over Lateral Raise', 'Barbell Front Raise',
  'Seated Arnold Dumbbell Press', 'Band Lateral Raise', 'Dumbbell Standing Alternate Press', 'Landmine Lateral Raise', 'Banded Face Pull',
  'Handstand Push-Up', 'Alternate Bent Over Dumbbell Reverse Fly', 'One-Arm Dumbbell Supported Bent Over Lateral Raise', 'Cable Incline Y Raise Back Supported', 'Plate Front Raise',
  'Seated Bent Over Dumbbell Lateral Raise', 'One-Arm Dumbbell Incline Lateral Raise', 'Cable Lateral Raise', 'Trap Y Raise', 'Band Upright Row',
  'Dumbbell Lateral Raise', 'Dumbbell Lu Raises', 'Dumbbell Poliquin Lateral Raise', 'Cable Seated Rear Lateral Raise', 'Cable Leaning Lateral Raise',
  'Dumbbell Snatch', 'Smith Machine Upright Row', 'One-Arm Dumbbell Lateral Raise', 'Chest Supported Lateral T Raise', 'Dumbbell Standing Driver',
  'One-Arm Kettlebell Overhead Press', 'Turkish Get Up', 'One-Arm Landmine Half Kneeling Shoulder Press', 'Seated Shoulder Press Neutral Grip', 'Landmine Press',
  'Dumbbell Alternate Front Raise', 'Powell Raise', 'One-Arm Cable Rear Delt Fly', 'Pike Push-Up On Bench', 'Rear Deltoid Stretch',
  'Machine Lateral Raise', 'Dumbbell Rear Delt Row', 'Dumbbell Incline Rear Lateral T Raise', 'Smith Shoulder Press', 'Kettlebell Windmill',
  'Cable Y Raise', 'Tsunami Overhead Press', 'Barbell Rear Delt Raise', 'Bird Dog Plank', 'Seated Barbell Shoulder Press',
  'Wall Angel', 'Handstand Hold',
  // Legs
  'Sliding Leg Curl', 'Rocking Half Frog Stretch', 'Standing Tibialis Raise', 'Anderson Squat', 'Pistol Squat',
  'Weighted Sissy Squat', 'Narrow Stance 45 Degree Leg Press', 'Barbell Calf Raise', 'Seated Single Leg Hamstring Stretch', 'Half Squat',
  'Deficit Deadlift', 'Weighted Seated Calf Raise', 'Smith Chair Squat', 'Seated Hip Adduction', 'Barbell Squat',
  'Pin Squat', 'Standing Forward Bend', 'Calf Leg Press', 'Snatch', 'Stationary Bike',
  'Lying Butterfly Pose', 'Deadlift', 'Barbell Step-up', 'Single-Leg Calf Raise with Dumbbell', 'Lowbar Squat',
  'Machine Belt Squat', 'Knee To Chest Stretch', 'Power Clean', 'High-Bar Squat', 'Box step-up',
  'Lying Quadriceps Stretch', 'Deep Squat to Wide Fold with Foot Hold', 'Stair Climber', 'Standing Quadriceps Stretch', 'Leg Swings',
  'Dumbbell Split Squat', 'Barbell Sumo Squat', 'Split Squat Front Foot Elevated', 'Bulgarian Bag Walking Lunges', 'Leg Press Wide Stance',
  'Roll Foot', 'Seated Leg Curl', 'Nordic Hamstring Curl', 'Smith Machine Glute Kickback', 'Resistance Band Hip Adduction',
  'Seated Calf Raise', 'Dumbbell Squat', 'Standing Leg Curl', 'Terminal Knee Extension', 'Bulgarian Squat Smith',
  'Single Leg Press', 'Jump Rope', 'Treadmill Climbing', 'Front Squat', 'Lunge Stretch',
  'Smith Squat', '90 To 90 Stretch', 'Downward Dog', 'Poliquin Step-Up', 'Hopping High Knee Tap',
  'One-Arm Kettlebell Swing', 'Single-Leg Deadlift', 'Single-Leg Calf Raise', 'Half Kneeling Quad Stretch', 'Rotary Calf Raise',
  'Barbell Walking Lunges', 'Dumbbell Jump', 'Box Jumps', 'Smith Hack Squat', 'Single Leg Seated Calf Machine Raise',
  'Hang Power Clean', 'Walking Lunges', 'Barbell Hack Squat', 'Smith Split Squat', 'Snatch Pull',
  'Squat', 'Dumbbell Cossack Squat', 'Band Lying Leg Curl', 'Dumbbell Walking Lunges', 'Barbell Rack Pull',
  'Barbell Straight Leg Deadlift', 'Barbell Thruster', 'Standing Calf Raise', 'Prowler Sled', 'Kickboxing',
  'Smith Calf Raises', 'Trap Bar Deadlift', 'Wall Sit', 'Goblet Squat', 'Side Lunges',
  'Barbell Split Squat', 'Split Squat', 'Kettlebell Rear Lunge', 'Dumbbell Goblet Squat', 'Dumbbell Straight Leg Deadlift',
  'Weighted Cossack Squat', 'Dumbbell Side Lunges', 'Crossack Squat', 'Hip Circles', 'Barbell Reverse Lunges',
  'Machine Hack Squat', 'Sumo Squat', 'Glute-Ham Raise 1/2', 'Seated Leg Extension Machine', 'Plyo side lunge',
  'Kettlebell Clean', 'Seated Single Leg Curl', 'Forward Band Monster Walk', 'Smith Squat To Bench', 'Cable Hip Adduction',
  'Kettlebell Deadlift', 'Dumbbell Standing Calf Raises', 'Landmine Squat', 'Single-Leg Cable Leg Curl', 'Kettlebell Swing',
  'Elliptical Trainer', 'Smith Seated Calf Raise', 'Machine Reverse Hack Squat', 'Assisted Pistol Squat', 'Pin Front Squat',
  'Dumbbell Step-Up', 'Smith Kneeling Hip Thrust', 'Rear Lunge', 'Broad Jump', 'Clean Squat',
  'Side Lying Quadriceps Stretch', 'Lizard Pose', 'Bulgarian Jump Squat', 'Rocking Frog', 'Smith Front Squat',
  'Zercher Squat', 'Burpee', 'Smith Zercher Squat', 'Superman', 'Butterfly Stretch',
  'Prone Lying Leg Curl', 'Pogo Jumps', 'Jumping Jacks', 'Barbell Cossack Squat', 'Pistol Box Squat',
  'Machine Calf Raises', 'Smith Rear Lunge', 'Stability Ball Wall Squat', 'Vertical Leg Press Smith Machine', 'Single-Leg Lying Curl',
  'Sumo Squat With Smith', 'Lever Horizontal Leg Press', 'Walking Cardio', 'Single-Leg Box Jump', 'Dumbbell Bulgarian Squat',
  'Single Leg Dumbbell Deadlift', 'Weighted Pistol Squat', 'Swiss Ball Leg Curl', 'Box Squat', 'Clean and Jerk',
  'Jump Squat', 'Assault Air Bike', 'Single-Leg Seated Calf Raise with Dumbbell', 'Sissy Squat', 'Reverse Nordic Curl',
  'Kneeling Hamstring Stretch', 'Bench Front Squat', 'Dumbbell Deadlift Straight Legs', 'Cable Romanian Deadlift', 'Seated Forward Fold',
  'Jefferson Curl', 'Side Leg Swings', 'Leg Press', 'Cyclist Squat', 'B Stance Romanian Deadlift',
  'Dumbbell Lying Leg Curl', 'Treadmill Run', 'Dumbbell Romanian Deadlift', 'Sumo Squat off Stepbox', 'Dumbbell Lunges',
  'Smith Romanian Deadlift', 'Lunges', 'Cable Step Up', 'Roll Calves', 'Dumbbell Deadlift',
  'Single-Leg Extension', 'Happy Baby Pose', 'Ring Leg Curl', 'Cable Terminal Knee Extension', 'Single Leg Smith Calf Raise',
  'Butterfly Lean Forward Stretch', 'Running', 'Barbell Overhead Squat', 'Band Squat', 'Barbell Bulgarian Squat',
  // Glutes
  'Dumbbell Single Leg Hip Thrust', 'Kneeling Resistance Band Glute Kickback', 'Dumbbell Reverse Lunge off Step', 'Cable Hip Abducction', 'Barbell Good Morning',
  'Mini Band Glute Bridge', 'Smith Machine Good Morning', 'Seated Band Hip Abduction', 'Donkey Kick', 'Hip Thrust Smith Machine',
  'Single Leg Romanian Deadlift', 'Weighted Back Extension', 'Seated Figure 4 Stretch', 'Band Standing Balance Glute Kickback', 'Barbell Rear Lunge On Step',
  'Figure 4 Stretch on Chair', 'Hip Thrust', 'Side Plank Hip Abduction', 'Glute Bridge', 'Glute Cable Kickback',
  'Weighted Glute Bridge', 'Side Lying Hip Abduction', 'Barbell Glute Bridge', 'Sumo Deadlift', 'Pigeon Pose',
  'Glutes Roll', 'Standing Hip Abduction', 'Back Extension', 'Dumbbell Rear Lunge', 'Cable Pull Through',
  'Glute Machine Kickback', 'Lying Knee To Chest Stretch', 'KAS Glute Bridge', 'Dumbbell Sumo Squat', 'Glute Bridge on Bench',
  'Single Leg Weighted Glute Bridge', 'Hip Hinge', 'Back Extension With Dumbbell', 'Romanian Deadlift', 'Kettlebell Goblet Squat',
  'Seated Hip Abduction', 'Band Hip Abduction', 'Band Reverse Hyperextension', 'Lateral Monster Walk', 'Frog Pump',
  'Bulgarian Squat', 'Machine Hip Thrust', 'Side Plank Clamshell', "Child's Pose", 'Deadlift from Blocks',
  'Band Lying Clamshells', 'Seated Good Morning', 'Bird Dog', 'Dumbbell Hip Thrust', 'Glute Bridge Single Leg',
  // Biceps
  'Band Biceps Curl', 'Zottman Curl', 'Close-grip EZ Bar Curl', 'Bayesian Cable Curl', 'Bar Cable Biceps Curl',
  'Dumbbell Spider Curl', 'Seated Dumbbell Curl', 'Spider Hammer Curl', 'Ring Muscle Up', 'Single Dumbbell Curl',
  'Dumbbell Supinated Preacher Curl', 'One-Arm Machine Preacher Curl', 'EZ-Bar Preacher Curl', 'Double Dumbbell Preacher Curl', 'Dumbbell Incline Hammer Curl',
  'Cable Squatting Curl', 'One-Arm Cable Biceps Curl', 'TRX Biceps Curl', 'EZ-Bar Biceps Curl', 'Band Hammer Curl',
  'Barbell Prone Incline Curl', 'Arm Blaster Biceps Dumbbell Curl', 'Dumbbell Hammer Curl', 'Biceps Barbell Curl', 'Dumbbell Alternate Supinated Curl',
  'Bayesian Cable Curl Seated', 'Seated Hammer Curl', 'One-Arm Preacher Hammer Curl', 'Weighted Chin Up', 'Wide Grip Standing Barbell Curl',
  'Dumbbell Drag Curl', 'Dumbbell Biceps Curl', 'Dumbbell Incline Alternate Supinated Curl', 'Machine Biceps Curl', 'Hercules Curl',
  'Barbell Preacher Curl', 'EZ-Bar Spider Curl', 'Incline Cable Curl', 'Bayesian Cable Curl (Face Away)', 'Dumbbell Cross Body Hammer Curl',
  'Close Grip Biceps Curl', 'One-Arm Hammer Cable Curl', 'Barbell Drag Curl', 'Concentration Hammer Curl', 'Kettlebell Biceps Curl',
  'Preacher Hammer Curl', 'Dumbbell Concentration Curl', 'Alternate Dumbbell Hammer Curl', 'Seated Incline Biceps Curl', 'One-Arm Dumbbell Preacher Curl',
  'Dumbbell Seated Alternate Hammer Curl', 'Barbell Wall Curl', 'Rope Cable Hammer Curl', 'Machine Preacher Curl', 'Cable Preacher Curl',
  'Alternate Biceps Curl',
  // Triceps
  'Diamond Push-Up', 'Weighted Dips', 'Cable Incline Skull Crusher', 'Cable Cross Triceps Extension', 'Triceps Cable Pushdown Reverse Grip',
  'JM Press', 'Cross Arms Push-Up', 'Standing One Dumbbell French Press', 'Knee Close Grip Push-Up', 'Lying EZ-Bar Triceps Extension',
  'Close Grip Smith Bench Press', 'Incline Close Grip Push-Up', 'EZ-Bar Seated Triceps Extension', 'Cobra Push-Up', 'Tate Press',
  'Overhead Triceps Stretch', 'Weighted Bench Dips', 'Close Grip Incline Dumbbell Bench Press', 'One-Arm Katana Triceps Overhead Extension', 'Lying Barbell Triceps Extension (Skullcrusher)',
  'Ring Triceps Extension', 'Planche Push-Up', 'One-Arm Cable Cross Body Triceps Extension', 'Bird Dog Push-Up', 'Close Grip Push-Up',
  'Frog Planche', 'Dips', 'Triceps Push-Up', 'One-Arm Reverse Grip Triceps Cable Pushdown', 'One-Arm Triceps Cable Pushdown',
  'High Pulley Overhead Triceps Extension', 'Cable Overhead Triceps Extension', 'One-Arm Dumbbell Seated Kickback', 'EZ-Bar Tricep Pushdown', 'Seated Triceps Bench Dip',
  'Ring Dips', 'Dumbbell Lying Triceps Extension', 'Suspension Triceps Extension', 'Dumbbell Seated Triceps Extension', 'Machine Triceps Extension',
  'Triceps Pushdown V-Bar', 'Assisted Machine Dips', 'One-Arm Cable Triceps Pushdown', 'Overhead Cable Triceps Extension (bar)', 'Cable Triceps Pushdown',
  'Standing Overhead Barbell Triceps Extension', 'Underhand Triceps Extension', 'Katana Triceps Extension', 'Decline Barbell French Press', 'Triceps Cable Kickback',
  'Weighted Muscle-Up', 'Muscle-up', 'California Press', 'Overhead Band Triceps Extension', 'Incline Barbell Triceps Extension',
  'Decline Diamond Push-Up', 'Seated Cable Horizontal French Press', 'Full Planche Push-Up', 'Incline Dumbbell Triceps Extension', 'Cable Double-Arm Tricep Kickback',
  'Knee Diamond Push-Up', 'Band Triceps Pushdown', 'Seated Dip Machine', 'One-Arm Cable Pushdown', 'One-Arm Overhead Triceps Extension',
  'Reverse Hand Push-Up', 'Rope Triceps Pushdown',
  // Forearms
  'Dumbbell Lying Pronation', 'One-Arm Neutral Wrist Dumbbell Curl', 'One-Arm Wrist Curl Dumbbell', 'EZ-Bar Seated Reverse Wrist Curl', 'One-Arm Dumbbell Supination',
  'Farmer Walk', 'Barbell Standing Wrist Curl', 'Dumbbell Standing Wrist Curl', 'Wrist Push-Up', 'Barbell Standing Back Wrist Curl',
  'Wrist Roller', 'EZ-Bar Seated Wrist Curl', 'Barbell Reverse Grip Forearm Curl', 'Unilateral Farmer Walk', 'EZ-Bar Reverse Spider Curl',
  'Dumbbell Farmer Carry', 'EZ-Bar Reverse Grip Biceps Curl', 'Dumbbell Standing Reverse Wrist Curls', 'Dead Hang', 'Barbell Reverse Wrist Curl',
  'Reverse Grip Cable Curl', 'Dumbbell Biceps Reverse Curl', 'Cable Wrist Curl', 'Seated Cable Wrist Curl', 'Hanging Scapular Retractions',
  'Barbell Wrist Curl', 'Hand Gripper', 'One-Arm Dumbbell Reverse Wrist Curl', 'Cable Standing Wrist Roll',
  // Abs
  'Knee Tuck Crunch', 'Bodyweight Windmill', 'Rotary Torso', 'L-Sit', 'Band Standing Side Bend',
  'Sitting Twist', 'Cable Twist (horizontal)', 'Leg In and Out', 'Weighted Decline Crunch', 'Hanging Scissors Kicks',
  'Ab Wheel Rollout', 'Dumbbell Side Bridge', 'Abdominal Crunches', 'Band Standing Twisting Crunches', 'Hollow Body Hold',
  'Weighted Straight Arm Crunch', 'Straight Leg Raise on Dip Bars', 'Cable Twist (up down)', 'Seated Alternate Crunches', 'Hanging Knee To Chest',
  'Incline Bench Leg Raises', 'Dragon Flag', 'Weighted Sit Up', 'Dead Bug', 'Med Ball Russian twist',
  'Band Pallof Press', 'Band Russian Twist', 'Band Standing Crunches', 'Cable Kneeling Side Crunch', 'Machine Abdominal Crunches',
  'Bicycle Crunches', 'Scissors', 'Low Cable Horizontal Pallof Press', 'Hanging Knees to Elbows', 'Weighted Dead Bug',
  'Stability Ball Crunch', 'Kneeling Band Abs Crunches', 'Barbell Standing Twist', 'Sit Up', 'Lying Stright Leg Raise',
  'Machine Lying Crunch', 'Ring Pike', 'Dead Bug with Ball', 'Plank', 'Hanging Knees to Elbows Waist',
  'Seated Reverse Circle Crunches', 'V-Up', 'Band Twist (horizontal)', 'V-Sit Crunch', 'Toes To Bar',
  'Standing Air Bike', 'Weighted Plank', 'Air Bike', 'Mountain climber', "Capitan's Chair Straight Leg Raises",
  'Incline Twisting Sit Up', 'Shoulderstand Pose', 'Hanging Knee Circles', 'Frog Crunch', 'Hanging Leg Raise To Bar',
  'Hanging Straight Leg Raise', 'High To Low Band Woodchopper', 'Crab Pose', 'Band Half Kneeling Chop', 'Weighted Hollow Body Hold',
  'Knee Raise Ab Coaster', 'Seated Machine Trunk Rotation', 'Seated Leg Raise', 'Side Crunch', 'Suspension V-Ups',
  'Reverse Crunches', 'Dumbbell Standing Side Bend', 'Toe Touches', 'Dumbbell Russian Twist', 'Hanging Half Windmill',
  'Upward Dog', 'Weighted Russian Twist', 'Seated Flutter Kick', 'Side Plank', 'Swiss Ball Plank',
  'Saw Plank', 'Standing Cable Ab Crunch', 'Barbell Rollout - Kneeling', 'Bottom up rotation', 'Band Kneeling Twisting Crunch',
  'Bear Plank', 'Lying Spinal Twist', 'Janda Sit Up', 'Standing Russian Twist', 'TRX Single Leg Bird Dog',
  'Abdominal Vaccum', 'Seated Ab Cable Crunch', 'Weighted Hanging Leg Raise', 'Weighted Ab Crunches', 'Opposite side elbow to knee',
  'Cable Horizontal Pallof Press', 'Landmine Twist', 'Band Bicycle Crunches', 'Hanging Oblique Knee Raise', 'Ankle Taps',
  'Cat Cow', 'Hanging Knee Raises', 'Kneeling Cable Abs Crunches', 'Decline Crunch', 'Seated Barbell Twist',
  'Captains Chair Knee Raises'
];

const allKnownExercises = Array.from(new Set([...Object.values(templateSeeds).flat(), ...exerciseLibrary])).sort();

const weekDays = [
  { label: 'Mon', full: 'Monday' },
  { label: 'Tue', full: 'Tuesday' },
  { label: 'Wed', full: 'Wednesday' },
  { label: 'Thu', full: 'Thursday' },
  { label: 'Fri', full: 'Friday' },
  { label: 'Sat', full: 'Saturday' },
  { label: 'Sun', full: 'Sunday' }
];

const initialState: LocalState = {
  profile: defaultProfile(),
  meals: [],
  savedMeals: [],
  strength: [],
  programs: [],
  cardio: [],
  steps: [],
  body: [],
  photos: []
};

class ViewErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel">
          <h2>Something broke on this screen</h2>
          <p className="hint">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [date, setDate] = useState(todayKey());
  const [state, setState] = useState<LocalState>(() => {
    const saved = loadLocal<Partial<LocalState>>('state', initialState);
    return { ...initialState, ...saved, programs: saved.programs || [] };
  });
  const [session, setSession] = useState<Session | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [localMode, setLocalMode] = useState(!hasSupabaseConfig);
  const [toast, setToast] = useState('');
  /** Stops onboarding flashing up before the real profile has come back from Supabase. */
  const [profileReady, setProfileReady] = useState(!hasSupabaseConfig);

  const todaysMeals = useMemo(() => state.meals.filter((entry) => entry.date === date), [state.meals, date]);
  const todaysTotals = useMemo(() => sumNutrients(todaysMeals), [todaysMeals]);
  const todaysStrength = state.strength.find((item) => item.date === date);
  const todaysCardio = state.cardio.filter((item) => item.date === date);
  const todaysSteps = state.steps.find((item) => item.date === date)?.steps || 0;
  const latestBody = [...state.body].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const pageTitles: Record<Tab, string> = {
    today: 'Today',
    food: 'Food',
    training: 'Training',
    cardio: 'Cardio',
    progress: 'Progress',
    profile: 'Your setup'
  };
  const firstName = state.profile.name.trim().split(/\s+/)[0] || 'there';

  useEffect(() => {
    if (!localMode) saveLocal('state', state);
    if (localMode) saveLocal('state', state);
  }, [state, localMode]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session || localMode) return;
    void loadRemote(session.user.id);
  }, [session, localMode]);

  function commit(next: LocalState) {
    setState(next);
    saveLocal('state', next);
  }

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  }

  /**
   * Supabase hands back errors rather than throwing, so an unchecked write fails
   * silently: local state updates, the next reload quietly reverts it. Returns true
   * when the write failed so callers can react.
   */
  function failed(what: string, error: { message: string } | null | undefined) {
    if (!error) return false;
    console.error(`[ateform] could not save ${what}:`, error.message);
    flash(`Couldn’t save your ${what}`);
    return true;
  }

  async function loadRemote(userId: string) {
    if (!supabase) return;
    const client = supabase;
    setRemoteLoading(true);
    try {
      const [profileRes, mealsRes, savedRes, strengthRes, programsRes, cardioRes, stepsRes, bodyRes, photosRes] = await Promise.all([
        client.from('profiles').select('*').eq('id', userId).maybeSingle(),
        client.from('meal_entries').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
        client.from('saved_meals').select('*').eq('user_id', userId),
        client.from('strength_sessions').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
        client.from('training_programs').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
        client.from('cardio_entries').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
        client.from('step_entries').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
        client.from('body_metrics').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
        client.from('progress_photos').select('*').eq('user_id', userId).order('log_date', { ascending: false })
      ]);

      const profile = profileRes.data
        ? profileFromRow(profileRes.data)
        : { ...state.profile, id: userId, name: session?.user.email?.split('@')[0] || 'You' };

      const photos = await Promise.all(
        (photosRes.data || []).map(async (row: any) => {
          const signed = await client.storage.from('progress-photos').createSignedUrl(row.storage_path, 60 * 60 * 24 * 7);
          return {
            id: row.id,
            date: row.log_date,
            label: row.label || 'Progress',
            url: signed.data?.signedUrl || ''
          };
        })
      );

      commit({
        profile,
        meals: (mealsRes.data || []).map(mealFromRow),
        savedMeals: (savedRes.data || []).map((row: any) => ({ id: row.id, name: row.name, items: row.items || [] })),
        strength: (strengthRes.data || []).map((row: any) => ({
          id: row.id,
          date: row.log_date,
          templateName: row.template_name,
          exercises: row.exercises || [],
          notes: row.notes || ''
        })),
        programs: (programsRes.data || []).map((row: any) => ({ id: row.id, name: row.name, days: row.days || [] })),
        cardio: (cardioRes.data || []).map((row: any) => ({
          id: row.id,
          date: row.log_date,
          type: row.type,
          durationMin: row.duration_min,
          distanceKm: row.distance_km || undefined,
          calories: row.calories || undefined
        })),
        steps: (stepsRes.data || []).map((row: any) => ({ id: row.id, date: row.log_date, steps: row.steps })),
        body: (bodyRes.data || []).map((row: any) => ({
          id: row.id,
          date: row.log_date,
          weightKg: row.weight_kg || undefined,
          waistCm: row.waist_cm || undefined,
          bodyFatPercent: row.body_fat_percent || undefined
        })),
        photos
      });
    } finally {
      setRemoteLoading(false);
      setProfileReady(true);
    }
  }

  async function upsertProfile(profile: UserProfile) {
    commit({ ...state, profile });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('profiles').upsert(profileToRow(profile));
      if (failed('profile', error)) return;
    }
    flash('Saved');
  }

  async function addMeal(entry: MealEntry) {
    commit({ ...state, meals: [entry, ...state.meals] });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('meal_entries').insert(mealToRow(entry, session.user.id));
      if (failed('food', error)) return;
    }
    flash('Added');
  }

  async function deleteMeal(id: string) {
    commit({ ...state, meals: state.meals.filter((entry) => entry.id !== id) });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('meal_entries').delete().eq('id', id);
      failed('change', error);
    }
  }

  async function saveMeal(savedMeal: SavedMeal) {
    const savedMeals = [savedMeal, ...state.savedMeals.filter((item) => item.id !== savedMeal.id)];
    commit({ ...state, savedMeals });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('saved_meals').upsert({ id: savedMeal.id, user_id: session.user.id, name: savedMeal.name, items: savedMeal.items });
      if (failed('meal', error)) return;
    }
    flash('Meal saved');
  }

  async function logSavedMeal(savedMeal: SavedMeal, mealType: MealType) {
    const entries = savedMeal.items.map<MealEntry>((item) => ({
      id: uid('meal'),
      date,
      mealType,
      food: item.food,
      grams: item.grams,
      nutrients: scaleNutrients(item.food.nutrientsPer100g, item.grams),
      createdAt: new Date().toISOString()
    }));
    commit({ ...state, meals: [...entries, ...state.meals] });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('meal_entries').insert(entries.map((entry) => mealToRow(entry, session.user.id)));
      if (failed('food', error)) return;
    }
    flash('Added');
  }

  async function saveStrength(sessionEntry: StrengthSession) {
    const strength = [sessionEntry, ...state.strength.filter((entry) => entry.id !== sessionEntry.id && entry.date !== sessionEntry.date)];
    commit({ ...state, strength });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('strength_sessions').upsert({
        id: sessionEntry.id,
        user_id: session.user.id,
        log_date: sessionEntry.date,
        template_name: sessionEntry.templateName,
        exercises: sessionEntry.exercises,
        notes: sessionEntry.notes || null
      });
      if (failed('workout', error)) return;
    }
    flash('Workout saved');
  }

  async function saveProgram(program: TrainingProgram) {
    const programs = [program, ...state.programs.filter((entry) => entry.id !== program.id)];
    commit({ ...state, programs });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('training_programs').upsert({ id: program.id, user_id: session.user.id, name: program.name, days: program.days });
      if (failed('program', error)) return;
    }
    flash('Program saved');
  }

  async function deleteProgram(id: string) {
    commit({ ...state, programs: state.programs.filter((entry) => entry.id !== id) });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('training_programs').delete().eq('id', id);
      failed('change', error);
    }
  }

  async function saveCardio(entry: CardioEntry) {
    commit({ ...state, cardio: [entry, ...state.cardio] });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('cardio_entries').insert({
        id: entry.id,
        user_id: session.user.id,
        log_date: entry.date,
        type: entry.type,
        duration_min: entry.durationMin,
        distance_km: entry.distanceKm || null,
        calories: entry.calories || null
      });
      if (failed('cardio', error)) return;
    }
    flash('Cardio added');
  }

  async function saveSteps(steps: number) {
    const entry: StepEntry = state.steps.find((item) => item.date === date) || { id: uid('steps'), date, steps };
    entry.steps = steps;
    commit({ ...state, steps: [entry, ...state.steps.filter((item) => item.date !== date)] });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('step_entries').upsert({ id: entry.id, user_id: session.user.id, log_date: date, steps });
      if (failed('steps', error)) return;
    }
    flash('Steps saved');
  }

  async function saveBody(entry: BodyMetric) {
    commit({ ...state, body: [entry, ...state.body.filter((item) => item.date !== entry.date)] });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('body_metrics').upsert({
        id: entry.id,
        user_id: session.user.id,
        log_date: entry.date,
        weight_kg: entry.weightKg || null,
        waist_cm: entry.waistCm || null,
        body_fat_percent: entry.bodyFatPercent || null
      });
      if (failed('measurements', error)) return;
    }
    flash('Saved');
  }

  async function savePhoto(file: File, label: string) {
    let url = URL.createObjectURL(file);
    const id = uid('photo');
    if (supabase && session && !localMode) {
      const path = `${session.user.id}/${date}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
      const upload = await supabase.storage.from('progress-photos').upload(path, file, { upsert: true });
      if (failed('photo', upload.error)) return;
      const { error } = await supabase.from('progress_photos').insert({ id, user_id: session.user.id, log_date: date, label, storage_path: path });
      if (failed('photo', error)) return;
      const signed = await supabase.storage.from('progress-photos').createSignedUrl(path, 60 * 60 * 24 * 7);
      url = signed.data?.signedUrl || url;
    }
    commit({ ...state, photos: [{ id, date, label, url }, ...state.photos] });
    flash('Photo added');
  }

  async function finishOnboarding(profile: UserProfile) {
    if (supabase && session && !localMode) {
      // Write first. If this fails, dropping into the app would be a lie — the next
      // reload pulls the un-onboarded row straight back and undoes everything.
      const { error } = await supabase.from('profiles').upsert(profileToRow(profile));
      if (failed('answers', error)) return;
    }
    commit({ ...state, profile });
    setTab('today');
    flash(`Welcome aboard, ${profile.name.trim().split(/\s+/)[0] || 'you'}`);
  }

  const authenticated = localMode || !hasSupabaseConfig || Boolean(session);

  if (!authenticated) {
    return <AuthScreen onLocal={() => { setLocalMode(true); setProfileReady(true); }} />;
  }

  if (!profileReady) {
    return (
      <main className="boot-screen">
        <Loader2 className="spin" size={22} />
        <p>Getting your stuff…</p>
      </main>
    );
  }

  if (!state.profile.onboardedAt) {
    return <Onboarding profile={state.profile} onComplete={finishOnboarding} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="mobile-brand" aria-label="Ateform">
          <div className="brand-mark">A</div>
        </div>
        <div className="topbar-copy">
          <p className="eyebrow">Hey, {firstName}</p>
          <h1>{pageTitles[tab]}</h1>
        </div>
        <div className="topbar-actions">
          <DateNav date={date} setDate={setDate} />
          <div className="profile-chip" title={localMode ? 'Just on this device' : session?.user.email}>
            {firstName.slice(0, 1).toUpperCase()}
          </div>
        </div>
      </header>

      {remoteLoading ? (
        <div className="sync-pill">
          <Loader2 size={14} className="spin" /> Syncing
        </div>
      ) : null}

      <main>
        <ViewErrorBoundary key={tab}>
        {tab === 'today' ? (
          <TodayView
            profile={state.profile}
            date={date}
            meals={todaysMeals}
            totals={todaysTotals}
            strength={todaysStrength}
            cardio={todaysCardio}
            steps={todaysSteps}
            latestBody={latestBody}
            history={{
              meals: state.meals,
              strength: state.strength,
              cardio: state.cardio,
              steps: state.steps,
              body: state.body
            }}
            onGo={setTab}
          />
        ) : null}
        {tab === 'food' ? (
          <FoodView
            date={date}
            meals={todaysMeals}
            savedMeals={state.savedMeals}
            onAdd={addMeal}
            onDelete={deleteMeal}
            onSaveMeal={saveMeal}
            onLogSavedMeal={logSavedMeal}
            remoteEnabled={Boolean(supabase && session && !localMode)}
          />
        ) : null}
        {tab === 'training' ? (
          <TrainingView
            date={date}
            session={todaysStrength}
            programs={state.programs}
            onSaveStrength={saveStrength}
            onSaveProgram={saveProgram}
            onDeleteProgram={deleteProgram}
          />
        ) : null}
        {tab === 'cardio' ? (
          <CardioView
            date={date}
            cardio={todaysCardio}
            steps={todaysSteps}
            onSaveCardio={saveCardio}
            onSaveSteps={saveSteps}
          />
        ) : null}
        {tab === 'progress' ? (
          <ProgressView
            date={date}
            body={state.body}
            photos={state.photos}
            workouts={state.strength}
            onSaveBody={saveBody}
            onSavePhoto={savePhoto}
          />
        ) : null}
        {tab === 'profile' ? (
          <ProfileView
            profile={state.profile}
            localMode={localMode}
            onSave={upsertProfile}
            onSignOut={async () => {
              if (supabase) await supabase.auth.signOut();
              setLocalMode(!hasSupabaseConfig);
              setProfileReady(!hasSupabaseConfig);
            }}
          />
        ) : null}
        </ViewErrorBoundary>
      </main>

      <nav className="tabbar">
        <div className="nav-brand" aria-label="Ateform"><div className="brand-mark">A</div><span>Ateform</span></div>
        <TabButton active={tab === 'today'} icon={<Home />} label="Today" onClick={() => setTab('today')} />
        <TabButton active={tab === 'food'} icon={<Utensils />} label="Food" onClick={() => setTab('food')} />
        <TabButton active={tab === 'training'} icon={<Dumbbell />} label="Train" onClick={() => setTab('training')} />
        <TabButton active={tab === 'cardio'} icon={<Activity />} label="Cardio" onClick={() => setTab('cardio')} />
        <TabButton active={tab === 'progress'} icon={<Weight />} label="Progress" onClick={() => setTab('progress')} />
        <TabButton active={tab === 'profile'} icon={<Settings />} label="Profile" onClick={() => setTab('profile')} />
      </nav>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function AuthScreen({ onLocal }: { onLocal: () => void }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  function changeMode(nextMode: 'sign-in' | 'sign-up') {
    setMode(nextMode);
    setPassword('');
    setShowPassword(false);
    setFeedback(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFeedback({ type: 'error', text: 'That email doesn’t look right.' });
      return;
    }
    if (password.length < 8) {
      setFeedback({ type: 'error', text: 'Your password needs at least 8 characters.' });
      return;
    }
    if (mode === 'sign-up' && !cleanName) {
      setFeedback({ type: 'error', text: 'What should we call you?' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    const result =
      mode === 'sign-up'
        ? await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: { data: { full_name: cleanName } }
          })
        : await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setBusy(false);

    if (result.error) {
      setFeedback({ type: 'error', text: result.error.message });
      return;
    }

    if (mode === 'sign-up' && !result.data.session) {
      setFeedback({
        type: 'success',
        text: 'You’re in. Check your inbox to confirm your email, then come back and sign in.'
      });
      setPassword('');
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-brand" aria-label="Ateform">
        <div className="brand-mark">A</div>
        <span>Ateform</span>
      </div>
      {hasSupabaseConfig ? (
        <section className="auth-card">
          <div className="auth-heading">
            <p className="eyebrow">Food, lifting, and your weight</p>
            <h1>{mode === 'sign-in' ? 'Welcome back' : 'Let’s get you set up'}</h1>
            <p>
              {mode === 'sign-in'
                ? 'Sign in and pick up where you left off.'
                : 'Track what you eat, what you lift, and how your weight moves.'}
            </p>
          </div>

          <form className="auth-form" onSubmit={submit} noValidate>
            {mode === 'sign-up' ? (
              <label>
                Name
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  disabled={busy}
                />
              </label>
            ) : null}

            <label>
              Email
              <input
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="you@example.com"
                disabled={busy}
              />
            </label>

            <label>
              Password
              <span className="password-field">
                <input
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  disabled={busy}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>

            {feedback ? (
              <div className={`auth-feedback ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>
                {feedback.text}
              </div>
            ) : null}

            <button className="primary auth-submit" disabled={busy} type="submit">
              {busy ? <Loader2 className="spin" size={18} /> : null}
              {busy ? 'One sec…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="auth-switch">
            <span>{mode === 'sign-in' ? "Don't have an account?" : 'Already have an account?'}</span>
            <button type="button" className="text-button" disabled={busy} onClick={() => changeMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
              {mode === 'sign-in' ? 'Create account' : 'Sign in'}
            </button>
          </div>
        </section>
      ) : (
        <div className="panel auth-card">
          <p className="hint">No account set up yet, but you can still try the app right here on this device.</p>
          <button className="primary" onClick={onLocal}>
            Try it on this device
          </button>
        </div>
      )}
    </main>
  );
}

type TodayHistory = {
  meals: MealEntry[];
  strength: StrengthSession[];
  cardio: CardioEntry[];
  steps: StepEntry[];
  body: BodyMetric[];
};

function TodayView({
  profile,
  date,
  meals,
  totals,
  strength,
  cardio,
  steps,
  latestBody,
  history,
  onGo
}: {
  profile: UserProfile;
  date: string;
  meals: MealEntry[];
  totals: ReturnType<typeof sumNutrients>;
  strength?: StrengthSession;
  cardio: CardioEntry[];
  steps: number;
  latestBody?: BodyMetric;
  history: TodayHistory;
  onGo: (tab: Tab) => void;
}) {
  const caloriesLeft = profile.calorieTarget - totals.calories;
  const calorieProgress = Math.min(100, Math.max(0, (totals.calories / profile.calorieTarget) * 100));
  const cardioMinutes = cardio.reduce((sum, item) => sum + item.durationMin, 0);
  const cardioCalories = cardio.reduce((sum, item) => sum + (item.calories || 0), 0);
  const stepProgress = Math.min(100, profile.dailyStepsTarget ? (steps / profile.dailyStepsTarget) * 100 : 0);
  const sets = strength ? countSets(strength.exercises) : 0;

  return (
    <section className="stack view today-view">
      <div className="panel intake-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Today</p>
            <h2>What you ate</h2>
          </div>
          <button className="secondary small" onClick={() => onGo('food')}>
            <Plus size={14} /> Add food
          </button>
        </div>
        <div className="intake-summary">
          <div
            className={`intake-ring ${caloriesLeft < 0 ? 'over' : ''}`}
            style={{ '--calorie-progress': `${calorieProgress}%` } as CSSProperties}
          >
            <div>
              <strong>{Math.abs(caloriesLeft).toLocaleString()}</strong>
              <span>{caloriesLeft < 0 ? 'kcal over' : 'kcal left'}</span>
            </div>
          </div>
          <div className="intake-bars">
            <Bar label="Calories" value={totals.calories} target={profile.calorieTarget} unit="" />
            <Bar label="Protein" value={totals.protein} target={profile.proteinTargetG} unit="g" />
            <Bar label="Carbs" value={totals.carbs} target={profile.carbTargetG} unit="g" />
            <Bar label="Fat" value={totals.fat} target={profile.fatTargetG} unit="g" />
          </div>
        </div>
      </div>

      <div className="panel activity-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Today</p>
            <h2>What you did</h2>
          </div>
          <span className="activity-note">{[strength, cardioMinutes, steps].filter(Boolean).length} of 3 done</span>
        </div>
        <div className="activity-list">
          <button className={`activity-row ${strength ? 'done' : ''}`} onClick={() => onGo('training')}>
            <span className="activity-icon"><Dumbbell size={17} /></span>
            <span className="activity-copy">
              <strong>Strength</strong>
              <small>{strength ? `${strength.templateName} · ${strength.exercises.length} exercises` : 'Nothing yet — tap to start'}</small>
            </span>
            <span className="activity-value"><b>{sets}</b><i>sets</i></span>
          </button>
          <button className={`activity-row ${cardioMinutes ? 'done' : ''}`} onClick={() => onGo('cardio')}>
            <span className="activity-icon"><Flame size={17} /></span>
            <span className="activity-copy">
              <strong>Cardio</strong>
              <small>
                {cardio.length
                  ? `${cardio.length} session${cardio.length === 1 ? '' : 's'}${cardioCalories ? ` · ${cardioCalories} kcal` : ''}`
                  : 'Nothing yet — tap to add'}
              </small>
            </span>
            <span className="activity-value"><b>{cardioMinutes}</b><i>min</i></span>
          </button>
          <button className={`activity-row ${steps >= profile.dailyStepsTarget && steps > 0 ? 'done' : ''}`} onClick={() => onGo('cardio')}>
            <span className="activity-icon"><Footprints size={17} /></span>
            <span className="activity-copy">
              <strong>Steps</strong>
              <small>{Math.round(stepProgress)}% of your {profile.dailyStepsTarget.toLocaleString()}</small>
              <span className="activity-meter"><i style={{ width: `${stepProgress}%` }} /></span>
            </span>
            <span className="activity-value"><b>{steps.toLocaleString()}</b><i>steps</i></span>
          </button>
        </div>
      </div>

      <ProgressSummary date={date} profile={profile} history={history} />

      <div className="panel">
        <div className="panel-head">
          <h2>Everything you logged</h2>
          <button className="text-button" onClick={() => onGo('food')}>See all</button>
        </div>
        {meals.length ? (
          <div className="list">
            {meals.slice(0, 5).map((entry) => (
              <div className="row" key={entry.id}>
                <div>
                  <strong>{entry.food.name}</strong>
                  <p>{entry.mealType} · {entry.grams}g</p>
                </div>
                <span className="mono">{entry.nutrients.calories} kcal</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Nothing yet" text="Head to the Food tab and add what you ate." />
        )}
      </div>
      <div className="panel compact-row">
        <div>
          <p className="eyebrow">Last weigh-in</p>
          <h2>{latestBody?.weightKg ? `${latestBody.weightKg} kg` : 'Not weighed yet'}</h2>
        </div>
        <button className="secondary small" onClick={() => onGo('progress')}>Add weight</button>
      </div>
    </section>
  );
}

function FoodView({
  date,
  meals,
  savedMeals,
  onAdd,
  onDelete,
  onSaveMeal,
  onLogSavedMeal,
  remoteEnabled
}: {
  date: string;
  meals: MealEntry[];
  savedMeals: SavedMeal[];
  onAdd: (entry: MealEntry) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSaveMeal: (meal: SavedMeal) => Promise<void>;
  onLogSavedMeal: (meal: SavedMeal, type: MealType) => Promise<void>;
  remoteEnabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>(seedFoods);
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState(100);
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [busy, setBusy] = useState(false);
  const [saveMealOpen, setSaveMealOpen] = useState(false);
  const [savedMealName, setSavedMealName] = useState('');
  const [custom, setCustom] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '' });
  const totals = sumNutrients(meals);

  async function search() {
    const q = query.trim();
    if (!q) {
      setResults(seedFoods);
      return;
    }
    setBusy(true);
    try {
      if (supabase && remoteEnabled) {
        const { data, error } = await supabase.functions.invoke('food-search', { body: { query: q } });
        if (!error && Array.isArray(data?.foods)) {
          setResults(data.foods);
          return;
        }
      }
      setResults(seedFoods.filter((food) => food.name.toLowerCase().includes(q.toLowerCase())));
    } finally {
      setBusy(false);
    }
  }

  function addCustomFood() {
    if (!custom.name) return;
    const food: Food = {
      id: uid('food'),
      source: 'custom',
      name: custom.name,
      servingUnit: '100 g',
      servingGrams: 100,
      nutrientsPer100g: {
        calories: Number(custom.calories) || 0,
        protein: Number(custom.protein) || 0,
        carbs: Number(custom.carbs) || 0,
        fat: Number(custom.fat) || 0
      }
    };
    setResults([food, ...results]);
    setSelected(food);
    setCustom({ name: '', calories: '', protein: '', carbs: '', fat: '' });
  }

  async function addSelected() {
    if (!selected) return;
    await onAdd({
      id: uid('meal'),
      date,
      mealType,
      food: selected,
      grams,
      nutrients: scaleNutrients(selected.nutrientsPer100g, grams),
      createdAt: new Date().toISOString()
    });
    setSelected(null);
  }

  function saveCurrentMeal() {
    const name = savedMealName.trim();
    if (!name || meals.length === 0) return;
    void onSaveMeal({
      id: uid('saved'),
      name,
      items: meals.map((entry) => ({ food: entry.food, grams: entry.grams }))
    });
    setSavedMealName('');
    setSaveMealOpen(false);
  }

  return (
    <section className="stack view food-view">
      <div className="panel food-intro">
        <div>
          <p className="eyebrow">Food</p>
          <h2>What did you eat?</h2>
          <p className="hint">Search for it, say how much you had, and we’ll work out the rest.</p>
        </div>
        <Apple size={30} aria-hidden="true" />
      </div>

      <div className="panel search-panel">
        <div className="search-line">
          <Search size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Search chicken, rice, yogurt..." />
          <button className="secondary small" onClick={search}>{busy ? <Loader2 className="spin" size={15} /> : 'Search'}</button>
        </div>
        <p className="hint">{remoteEnabled ? 'Searching USDA and Open Food Facts.' : 'Offline list for now — add your Supabase keys for the full food database.'}</p>
      </div>

      <div className="section-title"><div><p className="eyebrow">Browse</p><h2>{query ? 'What we found' : 'Common foods'}</h2></div><span>{results.length} foods</span></div>
      <div className="food-list">
        {results.map((food) => {
          const { Icon, tint } = foodCategory(food.name);
          return (
            <button className="food-result" key={food.id} onClick={() => { setSelected(food); setGrams(food.servingGrams || 100); }}>
              <span className="food-avatar" style={{ background: tint }}><Icon size={18} aria-hidden="true" /></span>
              <span className="food-result-copy">
                <strong>{food.name}</strong>
                <span>{food.brand || food.source} · 100g</span>
              </span>
              <MacroMini nutrients={food.nutrientsPer100g} />
              <span className="food-add" aria-hidden="true"><Plus size={16} /></span>
            </button>
          );
        })}
      </div>

      <div className="panel">
        <h2>Can’t find it? Add it yourself</h2>
        <div className="grid two">
          <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="What is it?" />
          <input value={custom.calories} onChange={(e) => setCustom({ ...custom, calories: e.target.value })} inputMode="decimal" placeholder="kcal / 100g" />
          <input value={custom.protein} onChange={(e) => setCustom({ ...custom, protein: e.target.value })} inputMode="decimal" placeholder="protein" />
          <input value={custom.carbs} onChange={(e) => setCustom({ ...custom, carbs: e.target.value })} inputMode="decimal" placeholder="carbs" />
          <input value={custom.fat} onChange={(e) => setCustom({ ...custom, fat: e.target.value })} inputMode="decimal" placeholder="fat" />
          <button className="secondary" onClick={addCustomFood}>Add it</button>
        </div>
      </div>

      {selected ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label={`Add ${selected.name}`}>
          <div className="panel modal-card food-log-modal">
            <div className="panel-head">
              <div><p className="eyebrow">{selected.brand || selected.source}</p><h2>{selected.name}</h2></div>
              <button className="icon-only" onClick={() => setSelected(null)} aria-label="Close"><X size={17} /></button>
            </div>
            <div className="grid two">
              <label>Which meal<select value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>{mealTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label>How much (g)<input value={grams} onChange={(e) => setGrams(Number(e.target.value) || 0)} inputMode="decimal" /></label>
            </div>
            <MacroMini nutrients={scaleNutrients(selected.nutrientsPer100g, grams)} />
            <NutrientGrid nutrients={scaleNutrients(selected.nutrientsPer100g, grams)} compact />
            <button className="primary" onClick={addSelected}><Plus size={16} /> Add it</button>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>What you ate today</h2>
            <p className="hint">{totals.calories} kcal · {totals.protein}g protein</p>
          </div>
          <button className="secondary small" onClick={() => setSaveMealOpen(true)} disabled={!meals.length}>Save as meal</button>
        </div>
        {meals.length ? (
          <div className="list">
            {meals.map((entry) => (
              <div className="row" key={entry.id}>
                <div>
                  <strong>{entry.food.name}</strong>
                  <p>{entry.mealType} · {entry.grams}g · {entry.nutrients.protein}p/{entry.nutrients.carbs}c/{entry.nutrients.fat}f</p>
                </div>
                <button className="icon-only danger" onClick={() => onDelete(entry.id)}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        ) : <Empty title="Nothing yet" text="Search above and add whatever you’ve had so far." />}
      </div>

      {meals.length ? <NutrientGrid nutrients={totals} /> : null}

      <div className="panel">
        <h2>Your saved meals</h2>
        {savedMeals.length ? savedMeals.map((meal) => (
          <div className="row" key={meal.id}>
            <div>
              <strong>{meal.name}</strong>
              <p>{meal.items.length} items</p>
            </div>
            <button className="secondary small" onClick={() => onLogSavedMeal(meal, mealType)}>Add</button>
          </div>
        )) : <Empty title="None saved yet" text="Eat the same thing often? Save it and add it in one tap next time." />}
      </div>

      {saveMealOpen ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Name this meal">
          <div className="panel modal-card">
            <div className="panel-head"><div><p className="eyebrow">Save it</p><h2>Give this meal a name</h2></div><button className="icon-only" onClick={() => setSaveMealOpen(false)} aria-label="Close"><X size={17} /></button></div>
            <p className="hint">We’ll keep all {meals.length} item{meals.length === 1 ? '' : 's'} and their portions.</p>
            <label className="modal-field">Meal name<input value={savedMealName} onChange={(e) => setSavedMealName(e.target.value)} autoFocus placeholder="e.g. My usual breakfast" /></label>
            <button className="primary" onClick={saveCurrentMeal} disabled={!savedMealName.trim()}>Save it</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function normalizeExercises(exercises: StrengthExercise[]): StrengthExercise[] {
  return exercises.map((exercise) => ({ ...exercise, sets: exercise.sets || [] }));
}

function TrainingView({
  date,
  session,
  programs,
  onSaveStrength,
  onSaveProgram,
  onDeleteProgram
}: {
  date: string;
  session?: StrengthSession;
  programs: TrainingProgram[];
  onSaveStrength: (session: StrengthSession) => Promise<void>;
  onSaveProgram: (program: TrainingProgram) => Promise<void>;
  onDeleteProgram: (id: string) => Promise<void>;
}) {
  const weekday = new Date(`${date}T00:00:00`).getDay();
  const mondayFirstDay = weekday === 0 ? 6 : weekday - 1;

  const [expandedExercises, setExpandedExercises] = useState<Set<number>>(new Set());
  const [exerciseModalOpen, setExerciseModalOpen] = useState(false);
  const [exerciseName, setExerciseName] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState(programs[0]?.id || '');
  const [viewDayIndex, setViewDayIndex] = useState(mondayFirstDay);
  const [dayNameDraft, setDayNameDraft] = useState('');
  const [daySearch, setDaySearch] = useState('');
  const [programsSheetOpen, setProgramsSheetOpen] = useState(false);
  const [newProgramName, setNewProgramName] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<{ text: string; onConfirm: () => void } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());

  const selectedProgram = programs.find((program) => program.id === selectedProgramId) || programs[0];
  const todaysProgramDayRaw = selectedProgram?.days.find((day) => day.weekday === mondayFirstDay);
  const todaysProgramDay = todaysProgramDayRaw?.isRestDay ? undefined : todaysProgramDayRaw;
  const viewedDay = selectedProgram?.days.find((day) => day.weekday === viewDayIndex);

  const [template, setTemplate] = useState(session?.templateName || todaysProgramDay?.name || '');
  const [exercises, setExercises] = useState<StrengthExercise[]>(() => {
    if (session) return normalizeExercises(session.exercises);
    if (todaysProgramDay) return todaysProgramDay.exercises.map((name) => ({ name, sets: [{ weightKg: 0, reps: 0 }, { weightKg: 0, reps: 0 }, { weightKg: 0, reps: 0 }] }));
    return [];
  });

  useEffect(() => {
    if (session) {
      setTemplate(session.templateName);
      setExercises(normalizeExercises(session.exercises));
      return;
    }
    setTemplate(todaysProgramDay?.name || '');
    setExercises(todaysProgramDay ? todaysProgramDay.exercises.map((name) => ({ name, sets: [{ weightKg: 0, reps: 0 }, { weightKg: 0, reps: 0 }, { weightKg: 0, reps: 0 }] })) : []);
  }, [session, todaysProgramDay]);

  useEffect(() => {
    if (programs.length && !programs.some((program) => program.id === selectedProgramId)) setSelectedProgramId(programs[0].id);
  }, [programs, selectedProgramId]);

  useEffect(() => {
    setDayNameDraft(viewedDay?.name || '');
    setDaySearch('');
    setSelectMode(false);
    setSelectedIndexes(new Set());
  }, [viewDayIndex, selectedProgramId, viewedDay?.name]);

  function toggleExpanded(exerciseIndex: number) {
    setExpandedExercises((current) => {
      const next = new Set(current);
      if (next.has(exerciseIndex)) next.delete(exerciseIndex); else next.add(exerciseIndex);
      return next;
    });
  }

  function updateSet(exerciseIndex: number, setIndex: number, field: 'weightKg' | 'reps', value: number) {
    setExercises((current) => current.map((exercise, i) => i !== exerciseIndex ? exercise : {
      ...exercise,
      sets: exercise.sets.map((set, j) => j !== setIndex ? set : { ...set, [field]: value })
    }));
  }

  function addExercise(name?: string) {
    const cleanName = (name ?? exerciseName).trim();
    if (!cleanName) return;
    setExercises([...exercises, { name: cleanName, sets: [{ weightKg: 0, reps: 0 }] }]);
    setExpandedExercises((current) => new Set(current).add(exercises.length));
    if (!template) setTemplate('Workout');
    setExerciseName('');
    setExerciseModalOpen(false);
  }

  function updateViewedDay(update: Partial<Pick<ProgramDay, 'name' | 'exercises' | 'isRestDay'>>) {
    if (!selectedProgram) return;
    const exists = selectedProgram.days.some((day) => day.weekday === viewDayIndex);
    const nextDays = exists
      ? selectedProgram.days.map((day) => day.weekday === viewDayIndex ? { ...day, ...update } : day)
      : [...selectedProgram.days, { id: uid('program-day'), weekday: viewDayIndex, name: 'Workout', exercises: [], ...update }].sort((a, b) => a.weekday - b.weekday);
    void onSaveProgram({ ...selectedProgram, days: nextDays });
  }

  function commitDayName() {
    const clean = dayNameDraft.trim();
    if (!viewedDay || !clean || clean === viewedDay.name) return;
    updateViewedDay({ name: clean });
  }

  function addExerciseToDay(name: string) {
    const clean = name.trim();
    if (!clean) return;
    updateViewedDay({ name: viewedDay?.name || dayNameDraft.trim() || 'Workout', exercises: [...(viewedDay?.exercises || []), clean], isRestDay: false });
    setDaySearch('');
  }

  function useTemplateForDay(templateName: string) {
    updateViewedDay({ name: templateName, exercises: [...templateSeeds[templateName]], isRestDay: false });
    setDayNameDraft(templateName);
  }

  function toggleRestDay() {
    updateViewedDay({ isRestDay: !viewedDay?.isRestDay });
  }

  function removeExerciseFromDay(index: number) {
    if (!viewedDay) return;
    const name = viewedDay.exercises[index];
    setConfirmTarget({
      text: `Remove "${name}" from ${weekDays[viewDayIndex].full}?`,
      onConfirm: () => updateViewedDay({ exercises: viewedDay.exercises.filter((_, i) => i !== index) })
    });
  }

  function toggleSelectMode() {
    setSelectMode((current) => !current);
    setSelectedIndexes(new Set());
  }

  function toggleExerciseSelected(index: number) {
    setSelectedIndexes((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  function requestDeleteSelected() {
    if (!viewedDay || !selectedIndexes.size) return;
    const count = selectedIndexes.size;
    setConfirmTarget({
      text: `Remove ${count} exercise${count === 1 ? '' : 's'} from ${weekDays[viewDayIndex].full}?`,
      onConfirm: () => {
        updateViewedDay({ exercises: viewedDay.exercises.filter((_, i) => !selectedIndexes.has(i)) });
        setSelectMode(false);
        setSelectedIndexes(new Set());
      }
    });
  }

  function requestDeleteProgram(program: TrainingProgram) {
    setConfirmTarget({
      text: `Delete "${program.name}"? This removes the whole program and can't be undone.`,
      onConfirm: () => {
        void onDeleteProgram(program.id);
        if (program.id === selectedProgram?.id) setSelectedProgramId(programs.find((item) => item.id !== program.id)?.id || '');
      }
    });
  }

  function createProgram() {
    const name = newProgramName.trim();
    if (!name) return;
    const program: TrainingProgram = { id: uid('program'), name, days: [] };
    void onSaveProgram(program);
    setSelectedProgramId(program.id);
    setNewProgramName('');
    setProgramsSheetOpen(false);
  }

  return (
    <section className="stack view training-view">
      <div className="panel program-overview">
        <div className="panel-head">
          <div><p className="eyebrow">Your week</p><h2>{selectedProgram?.name || 'No program yet'}</h2></div>
          <button className="secondary small" onClick={() => setProgramsSheetOpen(true)}>Program <ChevronDown size={14} /></button>
        </div>
        {selectedProgram ? (
          <div className="program-days">{weekDays.map((day, index) => {
            const programDay = selectedProgram.days.find((item) => item.weekday === index);
            const isRest = !programDay || programDay.isRestDay;
            return (
              <button type="button" className={`program-day ${index === mondayFirstDay ? 'today' : ''} ${!isRest ? 'planned' : ''} ${index === viewDayIndex ? 'viewing' : ''}`} key={day.label} onClick={() => setViewDayIndex(index)}>
                <span>{day.label}</span>
                {!isRest ? <><strong>{programDay!.name}</strong><small>{programDay!.exercises.length} exercises</small></> : <small>{programDay ? 'Rest' : 'Rest — tap to add'}</small>}
              </button>
            );
          })}</div>
        ) : <Empty title="No program yet" text="Tap Program above to create your first one — push/pull/legs, upper/lower, full body, whatever works for you." />}
      </div>

      {selectedProgram ? (
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">{weekDays[viewDayIndex].full}</p>
              <input className="day-name-input" value={dayNameDraft} onChange={(e) => setDayNameDraft(e.target.value)} onBlur={commitDayName} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} placeholder="Rest day" disabled={Boolean(viewedDay?.isRestDay)} />
            </div>
            <label className="rest-day-toggle">
              <input type="checkbox" checked={Boolean(viewedDay?.isRestDay)} onChange={toggleRestDay} />
              Rest day
            </label>
          </div>
          {viewedDay?.isRestDay ? (
            <Empty title="Marked as a rest day" text="Exercises for this day are hidden but kept. Uncheck 'Rest day' above to bring them back." />
          ) : (
            <>
              <div className="template-pills">{Object.keys(templateSeeds).map((name) => <button key={name} onClick={() => useTemplateForDay(name)}>Use {name}</button>)}</div>
              {viewedDay?.exercises.length ? (
                <div className="exercise-list-toolbar">
                  <button className="text-button" onClick={toggleSelectMode}>{selectMode ? 'Cancel' : 'Select'}</button>
                  {selectMode ? (
                    <>
                      <button className="text-button" onClick={() => setSelectedIndexes(new Set(viewedDay.exercises.map((_, i) => i)))}>Select all</button>
                      <button className="danger-button small" onClick={requestDeleteSelected} disabled={!selectedIndexes.size}>
                        <Trash2 size={13} /> Delete{selectedIndexes.size ? ` (${selectedIndexes.size})` : ''}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
              <div className="program-exercise-list">
                {viewedDay?.exercises.length ? viewedDay.exercises.map((name, index) => (
                  <div key={`${name}-${index}`}>
                    {selectMode ? (
                      <input type="checkbox" checked={selectedIndexes.has(index)} onChange={() => toggleExerciseSelected(index)} />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                    <strong>{name}</strong>
                    {selectMode ? <span /> : <button className="icon-only" onClick={() => removeExerciseFromDay(index)} aria-label={`Remove ${name}`}><X size={15} /></button>}
                  </div>
                )) : <p className="hint">Nothing planned for this day yet.</p>}
              </div>
              <div className="add-program-exercise">
                <input value={daySearch} onChange={(e) => setDaySearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addExerciseToDay(daySearch)} placeholder="Search exercises or type your own..." />
                <button className="secondary small" onClick={() => addExerciseToDay(daySearch)} disabled={!daySearch.trim()}><Plus size={14} /> Add</button>
              </div>
              {daySearch.trim() ? (
                <div className="exercise-search-results">
                  {allKnownExercises
                    .filter((name) => name.toLowerCase().includes(daySearch.trim().toLowerCase()) && !(viewedDay?.exercises || []).includes(name))
                    .slice(0, 8)
                    .map((name) => (
                      <button key={name} onClick={() => addExerciseToDay(name)}>
                        <Plus size={13} /> {name}
                      </button>
                    ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {selectedProgram && viewDayIndex === mondayFirstDay ? (
        <div className="panel">
          <div className="panel-head">
            <div><p className="eyebrow">Today's session</p><h2>{template || 'Rest day'}</h2></div>
            <button className="secondary small" onClick={() => setExerciseModalOpen(true)}><Plus size={14} /> Add exercise</button>
          </div>
          {exercises.length ? (
            <div className="exercise-list">
              {exercises.map((exercise, exerciseIndex) => {
                const isOpen = expandedExercises.has(exerciseIndex);
                return (
                  <div className={`exercise-card ${isOpen ? 'open' : ''}`} key={`${exercise.name}-${exerciseIndex}`}>
                    <button className="exercise-card-head" onClick={() => toggleExpanded(exerciseIndex)}>
                      <input className="exercise-name" value={exercise.name} onClick={(e) => e.stopPropagation()} onChange={(e) => setExercises(exercises.map((item, i) => i === exerciseIndex ? { ...item, name: e.target.value } : item))} />
                      <span className="exercise-card-meta">{exercise.sets.length} {exercise.sets.length === 1 ? 'set' : 'sets'}</span>
                      <ChevronDown className="exercise-card-chevron" size={16} aria-hidden="true" />
                    </button>
                    {isOpen ? (
                      <div className="exercise-card-body">
                        {exercise.sets.map((set, setIndex) => (
                          <div className="set-line" key={setIndex}>
                            <span>{setIndex + 1}</span>
                            <input inputMode="decimal" value={set.weightKg || ''} onChange={(e) => updateSet(exerciseIndex, setIndex, 'weightKg', Number(e.target.value) || 0)} placeholder="kg" />
                            <input inputMode="numeric" value={set.reps || ''} onChange={(e) => updateSet(exerciseIndex, setIndex, 'reps', Number(e.target.value) || 0)} placeholder="reps" />
                            <button className="icon-only" onClick={() => setExercises(exercises.map((item, i) => i === exerciseIndex ? { ...item, sets: item.sets.filter((_, j) => j !== setIndex) } : item))}>x</button>
                          </div>
                        ))}
                        <button className="text-button" onClick={() => setExercises(exercises.map((item, i) => i === exerciseIndex ? { ...item, sets: [...item.sets, { weightKg: 0, reps: 0 }] } : item))}>Add set</button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (!todaysProgramDayRaw || todaysProgramDayRaw.isRestDay) ? (
            <Empty title="Rest day" text="Nothing scheduled for today. Add an exercise above if you're training anyway, or plan this day above." />
          ) : (
            <Empty title="Nothing added yet" text={`"${todaysProgramDayRaw.name}" is on today's plan but has no exercises yet. Add some above, or add them to the plan above.`} />
          )}
          {exercises.length ? (
            <button className="primary" onClick={() => onSaveStrength({ id: session?.id || uid('strength'), date, templateName: template, exercises })}>
              <Save size={16} /> Save this workout
            </button>
          ) : null}
        </div>
      ) : null}

      {exerciseModalOpen ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Add exercise">
          <div className="panel modal-card">
            <div className="panel-head"><div><p className="eyebrow">New exercise</p><h2>What are you adding?</h2></div><button className="icon-only" onClick={() => setExerciseModalOpen(false)} aria-label="Close"><X size={17} /></button></div>
            <p className="hint">Anything you’re doing today, even if it’s not on the plan.</p>
            <label className="modal-field">Exercise name<input value={exerciseName} onChange={(e) => setExerciseName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && addExercise()} placeholder="e.g. Cable fly" /></label>
            {exerciseName.trim() ? (
              <div className="exercise-search-results">
                {allKnownExercises
                  .filter((name) => name.toLowerCase().includes(exerciseName.trim().toLowerCase()) && !exercises.some((item) => item.name === name))
                  .slice(0, 8)
                  .map((name) => (
                    <button key={name} onClick={() => addExercise(name)}>
                      <Plus size={13} /> {name}
                    </button>
                  ))}
              </div>
            ) : null}
            <button className="primary" onClick={() => addExercise()} disabled={!exerciseName.trim()}><Plus size={16} /> Add "{exerciseName.trim()}" as custom</button>
          </div>
        </div>
      ) : null}

      {programsSheetOpen ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Programs">
          <div className="panel modal-card">
            <div className="panel-head"><div><p className="eyebrow">Your programs</p><h2>Switch or create</h2></div><button className="icon-only" onClick={() => setProgramsSheetOpen(false)} aria-label="Close"><X size={17} /></button></div>
            {programs.length ? (
              <div className="programs-list">
                {programs.map((program) => (
                  <div key={program.id} className={`programs-list-row ${program.id === selectedProgram?.id ? 'active' : ''}`}>
                    <button className="programs-list-select" onClick={() => { setSelectedProgramId(program.id); setProgramsSheetOpen(false); }}>
                      <strong>{program.name}</strong>
                      <small>{program.days.length} day{program.days.length === 1 ? '' : 's'} planned</small>
                    </button>
                    <button className="icon-only" onClick={() => requestDeleteProgram(program)} aria-label={`Delete ${program.name}`}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            ) : <p className="hint">No programs yet — create your first one below.</p>}
            <label className="modal-field">New program name<input value={newProgramName} onChange={(e) => setNewProgramName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createProgram()} placeholder="e.g. Five day PPL" /></label>
            <button className="primary" onClick={createProgram} disabled={!newProgramName.trim()}><Plus size={16} /> Create program</button>
          </div>
        </div>
      ) : null}

      {confirmTarget ? (
        <div className="sheet" role="alertdialog" aria-modal="true" aria-label="Confirm">
          <div className="panel modal-card confirm-card">
            <h2>Are you sure?</h2>
            <p className="hint">{confirmTarget.text}</p>
            <div className="confirm-actions">
              <button className="secondary" onClick={() => setConfirmTarget(null)}>Cancel</button>
              <button className="danger-button" onClick={() => { confirmTarget.onConfirm(); setConfirmTarget(null); }}><Trash2 size={15} /> Remove</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CardioView({ date, cardio, steps, onSaveCardio, onSaveSteps }: {
  date: string;
  cardio: CardioEntry[];
  steps: number;
  onSaveCardio: (entry: CardioEntry) => Promise<void>;
  onSaveSteps: (steps: number) => Promise<void>;
}) {
  const [cardioForm, setCardioForm] = useState({ type: 'Walk', duration: '', distance: '', calories: '' });
  const [stepInput, setStepInput] = useState(String(steps || ''));
  const totalMinutes = cardio.reduce((total, entry) => total + entry.durationMin, 0);

  useEffect(() => setStepInput(String(steps || '')), [steps, date]);

  function saveCardioEntry() {
    if (!cardioForm.type.trim() || !Number(cardioForm.duration)) return;
    void onSaveCardio({ id: uid('cardio'), date, type: cardioForm.type.trim(), durationMin: Number(cardioForm.duration), distanceKm: Number(cardioForm.distance) || undefined, calories: Number(cardioForm.calories) || undefined });
    setCardioForm({ type: 'Walk', duration: '', distance: '', calories: '' });
  }

  return <section className="stack view cardio-view">
    <div className="cardio-hero">
      <div><p className="eyebrow">Cardio</p><h2>Get moving.</h2><p>Walks, runs, rides — anything that gets your heart going counts.</p></div>
      <Activity size={40} strokeWidth={1.7} />
    </div>
    <div className="panel cardio-log-panel">
      <div className="panel-head"><div><p className="eyebrow">Today</p><h2>Add a session</h2></div><span className="cardio-total">{totalMinutes} min</span></div>
      <div className="grid two">
        <label>Activity<input value={cardioForm.type} onChange={(e) => setCardioForm({ ...cardioForm, type: e.target.value })} placeholder="Walk, run, bike" /></label>
        <label>How long<input value={cardioForm.duration} onChange={(e) => setCardioForm({ ...cardioForm, duration: e.target.value })} inputMode="numeric" placeholder="minutes" /></label>
        <label>Distance <span className="label-optional">optional</span><input value={cardioForm.distance} onChange={(e) => setCardioForm({ ...cardioForm, distance: e.target.value })} inputMode="decimal" placeholder="km" /></label>
        <label>Calories <span className="label-optional">optional</span><input value={cardioForm.calories} onChange={(e) => setCardioForm({ ...cardioForm, calories: e.target.value })} inputMode="numeric" placeholder="kcal" /></label>
      </div>
      <button className="primary" onClick={saveCardioEntry} disabled={!cardioForm.type.trim() || !Number(cardioForm.duration)}><Bike size={16} /> Add it</button>
    </div>
    <div className="panel steps-panel">
      <div><p className="eyebrow">Every day</p><h2><Footprints size={20} /> Steps</h2><p className="hint">Walking counts too. Pop today’s number in.</p></div>
      <div className="steps-control"><input className="big-input" value={stepInput} onChange={(e) => setStepInput(e.target.value)} inputMode="numeric" placeholder="7000" /><button className="secondary small" onClick={() => onSaveSteps(Number(stepInput) || 0)}>Save</button></div>
    </div>
    <div className="panel cardio-history"><div className="panel-head"><div><p className="eyebrow">Today</p><h2>What you’ve done</h2></div><span>{cardio.length} session{cardio.length === 1 ? '' : 's'}</span></div>{cardio.length ? cardio.map((entry) => <div className="row cardio-row" key={entry.id}><div><strong>{entry.type}</strong><p>{entry.durationMin} minutes{entry.distanceKm ? ` · ${entry.distanceKm} km` : ''}</p></div><span>{entry.calories ? `${entry.calories} kcal` : 'Done'}</span></div>) : <Empty title="Nothing yet" text="Walks, runs, rides — whatever you did, add it above." />}</div>
  </section>;
}

function ProgressView({
  date,
  body,
  photos,
  workouts,
  onSaveBody,
  onSavePhoto
}: {
  date: string;
  body: BodyMetric[];
  photos: ProgressPhoto[];
  workouts: StrengthSession[];
  onSaveBody: (entry: BodyMetric) => Promise<void>;
  onSavePhoto: (file: File, label: string) => Promise<void>;
}) {
  const existing = body.find((item) => item.date === date);
  const [metric, setMetric] = useState({ weight: existing?.weightKg ? String(existing.weightKg) : '', waist: existing?.waistCm ? String(existing.waistCm) : '', bodyFat: existing?.bodyFatPercent ? String(existing.bodyFatPercent) : '' });
  const sortedBody = [...body].filter((item) => item.weightKg).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);

  return (
    <section className="stack view progress-view">
      <div className="panel">
        <h2>Your weight over time</h2>
        <Trend points={sortedBody.map((item) => ({ date: item.date, value: item.weightKg || 0 }))} />
      </div>
      <div className="panel">
        <h2>Today’s numbers</h2>
        <div className="grid three">
          <input value={metric.weight} onChange={(e) => setMetric({ ...metric, weight: e.target.value })} inputMode="decimal" placeholder="kg" />
          <input value={metric.waist} onChange={(e) => setMetric({ ...metric, waist: e.target.value })} inputMode="decimal" placeholder="waist (cm)" />
          <input value={metric.bodyFat} onChange={(e) => setMetric({ ...metric, bodyFat: e.target.value })} inputMode="decimal" placeholder="body fat (%)" />
        </div>
        <button className="secondary" onClick={() => onSaveBody({ id: existing?.id || uid('body'), date, weightKg: Number(metric.weight) || undefined, waistCm: Number(metric.waist) || undefined, bodyFatPercent: Number(metric.bodyFat) || undefined })}>Save</button>
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>Photos</h2>
          <label className="upload-button"><Camera size={16} /> Add<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onSavePhoto(e.target.files[0], 'Progress')} /></label>
        </div>
        {photos.length ? <div className="photo-grid">{photos.map((photo) => <img key={photo.id} src={photo.url} alt={photo.label} />)}</div> : <Empty title="No photos yet" text="Front, side, back. Take them every few weeks and compare." />}
      </div>
      <div className="panel">
        <h2>Workouts you’ve done</h2>
        {workouts.length ? workouts.slice(0, 8).map((workout) => <div className="row" key={workout.id}><strong>{prettyDate(workout.date)} · {workout.templateName}</strong><span>{countSets(workout.exercises)} sets</span></div>) : <Empty title="No workouts yet" text="Once you save a session it’ll show up here." />}
      </div>
    </section>
  );
}

function ProfileView({ profile, localMode, onSave, onSignOut }: { profile: UserProfile; localMode: boolean; onSave: (profile: UserProfile) => Promise<void>; onSignOut: () => Promise<void> }) {
  const [draft, setDraft] = useState(profile);
  const calculated = calculateTargets(draft);

  function save() {
    void onSave({ ...draft, ...calculated });
  }

  return (
    <section className="stack view profile-view">
      <div className="panel">
        <h2>About you</h2>
        <div className="grid two">
          <label>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label>Age<input value={draft.age} onChange={(e) => setDraft({ ...draft, age: Number(e.target.value) || 0 })} inputMode="numeric" /></label>
          <label>Height cm<input value={draft.heightCm} onChange={(e) => setDraft({ ...draft, heightCm: Number(e.target.value) || 0 })} inputMode="decimal" /></label>
          <label>Weight kg<input value={draft.currentWeightKg} onChange={(e) => setDraft({ ...draft, currentWeightKg: Number(e.target.value) || 0 })} inputMode="decimal" /></label>
          <label>Goal<select value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value as UserProfile['goal'] })}><option value="fat_loss">Lose fat</option><option value="recomp">Lose fat and build muscle</option><option value="muscle_gain">Build muscle</option><option value="maintain">Stay where I am</option></select></label>
          <label>Activity<select value={draft.activityLevel} onChange={(e) => setDraft({ ...draft, activityLevel: e.target.value as UserProfile['activityLevel'] })}><option value="light">Light</option><option value="moderate">Moderate</option><option value="active">Active</option><option value="very_active">Very active</option></select></label>
          <label>Days you train<input value={draft.trainingDaysPerWeek} onChange={(e) => setDraft({ ...draft, trainingDaysPerWeek: Number(e.target.value) || 0 })} inputMode="numeric" /></label>
          <label>Daily steps<input value={draft.dailyStepsTarget} onChange={(e) => setDraft({ ...draft, dailyStepsTarget: Number(e.target.value) || 0 })} inputMode="numeric" /></label>
          <label>Cardio days<input value={draft.cardioDaysPerWeek ?? 2} onChange={(e) => setDraft({ ...draft, cardioDaysPerWeek: Number(e.target.value) || 0 })} inputMode="numeric" /></label>
          <label>Goal weight <span className="label-optional">optional</span><input value={draft.targetWeightKg ?? ''} onChange={(e) => setDraft({ ...draft, targetWeightKg: Number(e.target.value) || undefined })} inputMode="decimal" placeholder="kg" /></label>
          <label>How you train<select value={draft.experienceLevel || ''} onChange={(e) => setDraft({ ...draft, experienceLevel: (e.target.value || undefined) as UserProfile['experienceLevel'] })}><option value="">Rather not say</option><option value="new">Brand new</option><option value="returning">Getting back into it</option><option value="intermediate">A year or two in</option><option value="advanced">Been at it for years</option></select></label>
          <label>How fast<select value={draft.weeklyPace || 'steady'} onChange={(e) => setDraft({ ...draft, weeklyPace: e.target.value as UserProfile['weeklyPace'] })} disabled={draft.goal === 'maintain'}><option value="easy">Take it easy</option><option value="steady">Steady</option><option value="fast">Push it</option></select></label>
        </div>
      </div>
      <div className="panel target-card">
        <p className="eyebrow">Your daily target</p>
        <h2>{calculated.calorieTarget} kcal</h2>
        <MacroMini nutrients={{ calories: calculated.calorieTarget, protein: calculated.proteinTargetG, carbs: calculated.carbTargetG, fat: calculated.fatTargetG }} />
        <p className="hint">You burn around {calculated.bmr} doing nothing, roughly {calculated.tdee} on a normal day.</p>
        <button className="primary" onClick={save}><Save size={16} /> Save</button>
      </div>
      <div className="panel">
        <button className="secondary" onClick={onSignOut}><LogOut size={16} /> {localMode ? 'Leave this device' : 'Sign out'}</button>
      </div>
    </section>
  );
}

function DateNav({ date, setDate }: { date: string; setDate: (date: string) => void }) {
  function move(days: number) {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    setDate(todayKey(d));
  }
  return <div className="date-nav"><button onClick={() => move(-1)} aria-label="Previous day"><ChevronLeft size={16} /></button><span>{date === todayKey() ? 'Today' : prettyDate(date)}</span><button onClick={() => move(1)} aria-label="Next day"><ChevronRight size={16} /></button></div>;
}

function ProgressSummary({ date, profile, history }: { date: string; profile: UserProfile; history: TodayHistory }) {
  const [range, setRange] = useState<ProgressRange>('week');
  const days = useMemo(() => rangeDays(date, range), [date, range]);
  const elapsed = useMemo(() => days.filter((day) => day <= date), [days, date]);

  const intakeByDay = useMemo(() => {
    const map = new Map<string, { calories: number; protein: number }>();
    for (const entry of history.meals) {
      const current = map.get(entry.date) || { calories: 0, protein: 0 };
      current.calories += entry.nutrients.calories;
      current.protein += entry.nutrients.protein;
      map.set(entry.date, current);
    }
    return map;
  }, [history.meals]);

  const cardioByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of history.cardio) map.set(entry.date, (map.get(entry.date) || 0) + entry.durationMin);
    return map;
  }, [history.cardio]);

  const stepsByDay = useMemo(() => new Map(history.steps.map((entry) => [entry.date, entry.steps])), [history.steps]);
  const strengthDays = useMemo(() => new Set(history.strength.map((entry) => entry.date)), [history.strength]);

  const loggedDays = elapsed.filter((day) => (intakeByDay.get(day)?.calories || 0) > 0);
  const avgCalories = average(loggedDays.map((day) => intakeByDay.get(day)?.calories || 0));
  const avgProtein = average(loggedDays.map((day) => intakeByDay.get(day)?.protein || 0));
  const workouts = elapsed.filter((day) => strengthDays.has(day)).length;
  const workoutTarget = Math.max(1, Math.round((profile.trainingDaysPerWeek * days.length) / 7));
  const cardioMinutes = elapsed.reduce((sum, day) => sum + (cardioByDay.get(day) || 0), 0);
  const stepDays = elapsed.filter((day) => (stepsByDay.get(day) || 0) > 0);
  const avgSteps = average(stepDays.map((day) => stepsByDay.get(day) || 0));

  const weights = history.body
    .filter((entry) => entry.weightKg && entry.date >= days[0] && entry.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const weightChange = weights.length > 1 ? (weights.at(-1)!.weightKg! - weights[0].weightKg!) : null;

  return (
    <div className="panel progress-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Zoom out</p>
          <h2>How you’re doing</h2>
        </div>
        <div className="range-toggle">
          <button className={range === 'week' ? 'active' : ''} onClick={() => setRange('week')}>Week</button>
          <button className={range === 'month' ? 'active' : ''} onClick={() => setRange('month')}>Month</button>
        </div>
      </div>

      <div className={`day-strip ${range}`}>
        {days.map((day, index) => {
          const calories = intakeByDay.get(day)?.calories || 0;
          const pct = profile.calorieTarget ? Math.min(100, (calories / profile.calorieTarget) * 100) : 0;
          const future = day > date;
          return (
            <div
              className={`day-col ${future ? 'future' : ''} ${day === date ? 'current' : ''}`}
              key={day}
              title={`${prettyDate(day)} · ${calories} kcal${strengthDays.has(day) ? ' · workout' : ''}`}
            >
              <span className="day-track">
                <i className={calories > profile.calorieTarget * 1.05 ? 'over' : ''} style={{ height: `${calories ? Math.max(pct, 6) : 0}%` }} />
              </span>
              <em className={strengthDays.has(day) ? 'trained' : ''} />
              {range === 'week' ? <span>{weekDays[index].label[0]}</span> : null}
            </div>
          );
        })}
      </div>
      <p className="strip-legend">
        Each bar is a day’s calories. A dot means you trained. You logged {loggedDays.length} of {elapsed.length} day
        {elapsed.length === 1 ? '' : 's'} this {range}.
      </p>

      <div className="stat-grid">
        <StatTile label="Calories a day" value={avgCalories ? avgCalories.toLocaleString() : '—'} hint={`you aim for ${profile.calorieTarget.toLocaleString()}`} pct={ratio(avgCalories, profile.calorieTarget)} />
        <StatTile label="Protein a day" value={avgProtein ? `${avgProtein}g` : '—'} hint={`you aim for ${profile.proteinTargetG}g`} pct={ratio(avgProtein, profile.proteinTargetG)} />
        <StatTile label="Workouts" value={String(workouts)} hint={`you planned ${workoutTarget}`} pct={ratio(workouts, workoutTarget)} />
        <StatTile label="Cardio" value={`${cardioMinutes}m`} hint={`this ${range}`} />
        <StatTile label="Steps a day" value={avgSteps ? avgSteps.toLocaleString() : '—'} hint={`you aim for ${profile.dailyStepsTarget.toLocaleString()}`} pct={ratio(avgSteps, profile.dailyStepsTarget)} />
        <StatTile
          label="Weight"
          value={weightChange === null ? '—' : `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} kg`}
          hint={weightChange === null ? 'weigh in twice to see this' : `this ${range}`}
        />
      </div>
    </div>
  );
}

function StatTile({ label, value, hint, pct }: { label: string; value: string; hint: string; pct?: number }) {
  return (
    <div className="stat-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      {pct === undefined ? null : <i><b style={{ width: `${pct}%` }} /></i>}
      <small>{hint}</small>
    </div>
  );
}

function Bar({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const pct = Math.min(100, (value / target) * 100);
  return <div className="bar-row"><div><span>{label}</span><span className="mono">{value}{unit} / {target}{unit}</span></div><div className="bar"><i style={{ width: `${pct}%` }} /></div></div>;
}

function MacroMini({ nutrients }: { nutrients: { calories: number; protein: number; carbs: number; fat: number } }) {
  return <div className="macro-mini"><span>{nutrients.calories} kcal</span><span>{nutrients.protein}p</span><span>{nutrients.carbs}c</span><span>{nutrients.fat}f</span></div>;
}

function NutrientGrid({ nutrients, compact = false }: { nutrients: Food['nutrientsPer100g']; compact?: boolean }) {
  const rows = [
    { label: 'Fibre', value: nutrients.fiber, unit: 'g', target: 30 },
    { label: 'Sodium', value: nutrients.sodiumMg, unit: 'mg', target: 2300 },
    { label: 'Potassium', value: nutrients.potassiumMg, unit: 'mg', target: 3400 },
    { label: 'Calcium', value: nutrients.calciumMg, unit: 'mg', target: 1000 },
    { label: 'Iron', value: nutrients.ironMg, unit: 'mg', target: 8 },
    { label: 'Magnesium', value: nutrients.magnesiumMg, unit: 'mg', target: 420 },
    { label: 'Zinc', value: nutrients.zincMg, unit: 'mg', target: 11 },
    { label: 'Vitamin C', value: nutrients.vitaminCMg, unit: 'mg', target: 90 },
    { label: 'Vitamin D', value: nutrients.vitaminDUg, unit: 'µg', target: 15 },
    { label: 'B12', value: nutrients.vitaminB12Ug, unit: 'µg', target: 2.4 }
  ].filter((row) => row.value !== undefined && row.value !== null && Number(row.value) > 0);

  if (!rows.length) return null;
  const visibleRows = compact ? rows.slice(0, 4) : rows;
  return <div className={`nutrient-panel ${compact ? 'compact' : ''}`}>
    {!compact ? <div className="panel-head"><div><p className="eyebrow">The rest</p><h2>Vitamins and minerals</h2></div><span className="nutrient-note">vs a normal day</span></div> : <p className="eyebrow">Also in this portion</p>}
    <div className="nutrient-grid">{visibleRows.map((row) => {
      const value = Number(row.value);
      const progress = Math.min(100, (value / row.target) * 100);
      return <div className="nutrient-card" key={row.label}><div><span>{row.label}</span><strong>{value}{row.unit}</strong></div><i><b style={{ width: `${progress}%` }} /></i><small>{Math.round(progress)}% of a day</small></div>;
    })}</div>
    {!compact && rows.length < 10 ? <p className="nutrient-disclaimer">We only show what the food source actually reports. The daily numbers are rough adult guides, not medical advice.</p> : null}
  </div>;
}

function Trend({ points }: { points: Array<{ date: string; value: number }> }) {
  if (points.length < 2) return <Empty title="Not enough yet" text="Weigh in a few more times and a line will show up here." />;
  const min = Math.min(...points.map((p) => p.value));
  const max = Math.max(...points.map((p) => p.value));
  const span = Math.max(1, max - min);
  return <div className="trend">{points.map((point) => <div key={point.date} style={{ height: `${18 + ((point.value - min) / span) * 82}%` }}><span>{point.value}</span></div>)}</div>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><strong>{title}</strong><p>{text}</p></div>;
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactElement; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function countSets(exercises: StrengthExercise[]) {
  return exercises.reduce((sum, exercise) => sum + (exercise.sets || []).filter((set) => set.weightKg && set.reps).length, 0);
}

/** Every day key of the calendar week (Monday first) or calendar month containing `anchor`. */
function rangeDays(anchor: string, range: ProgressRange) {
  const date = new Date(`${anchor}T00:00:00`);
  if (range === 'week') {
    const weekday = date.getDay();
    const start = new Date(date);
    start.setDate(date.getDate() - (weekday === 0 ? 6 : weekday - 1));
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return todayKey(day);
    });
  }
  const year = date.getFullYear();
  const month = date.getMonth();
  const total = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: total }, (_, index) => todayKey(new Date(year, month, index + 1)));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function ratio(value: number, target: number) {
  if (!target) return 0;
  return Math.min(100, Math.max(0, (value / target) * 100));
}

function foodCategory(name: string) {
  const text = name.toLowerCase();
  if (/beef|steak|burger|meatball|pork|bacon|ham\b/.test(text)) return { Icon: Beef, tint: '#8a3a2c' };
  if (/chicken|turkey|poultry|drumstick/.test(text)) return { Icon: Drumstick, tint: '#8a5a1f' };
  if (/egg/.test(text)) return { Icon: Egg, tint: '#8a7a1f' };
  if (/fish|salmon|tuna|shrimp|seafood/.test(text)) return { Icon: Fish, tint: '#1f6a8a' };
  if (/milk|yogurt|yoghurt|cheese|dairy/.test(text)) return { Icon: Milk, tint: '#5a5a5a' };
  if (/rice|bread|khobz|wheat|pasta|oat|grain/.test(text)) return { Icon: Wheat, tint: '#7a6320' };
  if (/apple|fruit|berry|banana|orange/.test(text)) return { Icon: Apple, tint: '#2f7a3d' };
  if (/carrot|vegetable|broccoli|spinach|pepper|onion/.test(text)) return { Icon: Carrot, tint: '#a05a1f' };
  return { Icon: Utensils, tint: '#5a5a5a' };
}

function mealToRow(entry: MealEntry, userId: string) {
  return {
    id: entry.id,
    user_id: userId,
    log_date: entry.date,
    meal_type: entry.mealType,
    food_snapshot: entry.food,
    grams: entry.grams,
    nutrients: entry.nutrients,
    created_at: entry.createdAt
  };
}

function mealFromRow(row: any): MealEntry {
  return {
    id: row.id,
    date: row.log_date,
    mealType: row.meal_type,
    food: row.food_snapshot,
    grams: row.grams,
    nutrients: row.nutrients,
    createdAt: row.created_at
  };
}

function profileToRow(profile: UserProfile) {
  return {
    id: profile.id,
    display_name: profile.name,
    age: profile.age,
    gender: profile.gender,
    height_cm: profile.heightCm,
    current_weight_kg: profile.currentWeightKg,
    activity_level: profile.activityLevel,
    training_days_per_week: profile.trainingDaysPerWeek,
    daily_steps_target: profile.dailyStepsTarget,
    goal: profile.goal,
    calorie_target: profile.calorieTarget,
    protein_target_g: profile.proteinTargetG,
    fat_target_g: profile.fatTargetG,
    carb_target_g: profile.carbTargetG,
    target_weight_kg: profile.targetWeightKg ?? null,
    experience_level: profile.experienceLevel ?? null,
    weekly_pace: profile.weeklyPace || 'steady',
    cardio_days_per_week: profile.cardioDaysPerWeek ?? 2,
    onboarded_at: profile.onboardedAt ?? null
  };
}

function profileFromRow(row: any): UserProfile {
  return {
    id: row.id,
    name: row.display_name || 'You',
    age: row.age || 21,
    gender: row.gender || 'male',
    heightCm: row.height_cm || 182,
    currentWeightKg: row.current_weight_kg || 80,
    activityLevel: row.activity_level || 'active',
    trainingDaysPerWeek: row.training_days_per_week || 5,
    dailyStepsTarget: row.daily_steps_target || 7000,
    goal: row.goal || 'recomp',
    calorieTarget: row.calorie_target || 2450,
    proteinTargetG: row.protein_target_g || 170,
    fatTargetG: row.fat_target_g || 70,
    carbTargetG: row.carb_target_g || 285,
    targetWeightKg: row.target_weight_kg || undefined,
    experienceLevel: row.experience_level || undefined,
    weeklyPace: row.weekly_pace || 'steady',
    cardioDaysPerWeek: row.cardio_days_per_week ?? 2,
    onboardedAt: row.onboarded_at || null
  };
}
