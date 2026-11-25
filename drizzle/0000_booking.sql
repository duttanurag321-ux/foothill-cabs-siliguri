CREATE TABLE routes (id TEXT PRIMARY KEY, data TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE slots (id TEXT PRIMARY KEY, route TEXT NOT NULL, vehicle TEXT NOT NULL, start INTEGER NOT NULL, finish INTEGER NOT NULL, closed INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE INDEX vehicle_times ON slots(vehicle,start,finish);
--> statement-breakpoint
CREATE TABLE bookings (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, slot TEXT NOT NULL, route TEXT NOT NULL, start INTEGER NOT NULL, price INTEGER NOT NULL, rider TEXT NOT NULL, phone TEXT NOT NULL, pickup TEXT NOT NULL, dropoff TEXT NOT NULL, passengers INTEGER NOT NULL, vehicle TEXT NOT NULL, status TEXT NOT NULL, expires INTEGER NOT NULL, order_id TEXT UNIQUE, payment_id TEXT UNIQUE, created INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX booking_availability ON bookings(slot,status,expires);
--> statement-breakpoint
CREATE TABLE images (id TEXT PRIMARY KEY, mime TEXT NOT NULL, body BLOB NOT NULL);
