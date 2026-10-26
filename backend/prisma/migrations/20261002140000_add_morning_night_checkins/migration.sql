-- Keep existing daily check-ins as the morning entry during the transition.
ALTER TABLE `checkins`
    ADD COLUMN `period` ENUM('MORNING', 'NIGHT') NOT NULL DEFAULT 'MORNING';

DROP INDEX `checkins_elderId_checkinDate_key` ON `checkins`;

CREATE UNIQUE INDEX `checkins_elderId_checkinDate_period_key`
    ON `checkins`(`elderId`, `checkinDate`, `period`);
