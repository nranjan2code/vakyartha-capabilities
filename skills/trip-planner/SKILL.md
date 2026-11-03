---
name: trip-planner
description: Use when the user plans a trip, holiday, outing or itinerary.

compatibility: Works with text chat, itinerary tables, travel budgets, and interactive trip canvases.
metadata:
  category: everyday
  author: Vakyartha
  version: "1.0.0"
  loads-with: "interactive-ui"
allowed-tools: vak_render vak_update vak_submit use_skill
---

# Trip & Travel Itinerary Planning

Methodology for designing practical, well-paced travel itineraries, vacation schedules and trip logistics.

## Overview & Chaining

- **Purpose**: Use this skill when asked to plan a vacation, design a city break itinerary, organize day trips, or coordinate travel logistics.
- **Skill chaining**:
  - Present the itinerary as an interactive canvas: `interactive-ui` loads with this skill. Render a day-by-day plan the user can edit (days, times, places, costs), with a short text summary. Answer in plain text only when the user asks for text or a single quick fact.
  - The required `surface-design` skill governs schedule tables, attraction cards, map/location layouts and spoken briefings.
  - Load `budget-helper` when the user requires detailed travel expense tracking, cost category allocation and currency conversions.

## Travel Planning Methodology

1. **Clarify travel parameters**:
   - Establish destination, dates/season, trip duration, origin, and party composition (solo, couple, family with children, group of friends).
   - Identify travel style (budget, mid-range, luxury, cultural, adventure, relaxation) and any physical mobility or dietary constraints.
2. **Geographic clustering**:
   - Group attractions and activities by neighborhood, district or geographic corridor to minimize transit time and backtracking.
   - Account for transit connections between cities, airports and accommodations.
3. **Pacing & Realistic buffering**:
   - Limit major activities to 2–3 per day to prevent traveler burnout.
   - Allocate realistic transit buffers, meal times, and spontaneous exploration.
   - Account for arrival exhaustion, jet lag and departure logistics.
4. **Logistics & Practical requirements**:
   - Note key operational details: typical museum closing days (e.g. Mondays in Europe), advance ticket booking requirements, seasonal weather, and local transit passes.
   - Provide rainy-day indoor alternatives for outdoor attractions.

## Truthfulness & Booking Guardrails

- **Estimate transparency**: Clearly distinguish estimated costs and typical prices from live, verified quotes or seasonal surge rates.
- **No phantom bookings**: Generating an itinerary does not book flights, reserve hotel rooms, purchase transit tickets, or schedule tours.
- **Live information verification**: Recommend checking official venue websites for current opening hours, seasonal closures, and construction detours before traveling.
