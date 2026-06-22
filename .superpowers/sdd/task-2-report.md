# Task 2 Fix Report — YAGNI Over-build Cleanup

## Changes Made

### 1. Button (`client/src/components/ui/button.tsx`)
- Removed **3 extra variants**: `destructive`, `secondary`, `link`
- Removed **1 extra size**: `icon`
- Kept: `variant: 'default' | 'outline' | 'ghost'`, `size: 'default' | 'sm' | 'lg'`

### 2. Card (`client/src/components/ui/card.tsx`)
- Removed **3 extra sub-components**: `CardTitle`, `CardDescription`, `CardFooter`
- Kept: `Card`, `CardHeader`, `CardContent`

### 3. cn() utility (`client/src/lib/utils.ts`)
- Replaced `clsx` + `tailwind-merge` implementation with a simple inline filter-join function
- Uninstalled unused dependencies: `clsx`, `tailwind-merge`

### 4. Input and Label
- Left untouched as instructed (they are in the plan)

## Verification
- `npx tsc -b --noEmit` — PASS
- `npm run build` — PASS
