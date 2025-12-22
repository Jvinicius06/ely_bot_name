-- =====================================================
-- 1. TABELA DE USERS (Sistema de identificação)
-- =====================================================
CREATE TABLE IF NOT EXISTS `users` (
    `userId` int UNSIGNED NOT NULL AUTO_INCREMENT,
    `username` varchar(255) DEFAULT NULL,
    `license` varchar(50) DEFAULT NULL,
    `license2` varchar(50) DEFAULT NULL,
    `fivem` varchar(20) DEFAULT NULL,
    `discord` varchar(30) DEFAULT NULL,
    PRIMARY KEY (`userId`),
    UNIQUE KEY `unique_license2` (`license2`),
    KEY `idx_license` (`license`),
    KEY `idx_discord` (`discord`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tabela principal de usuários - identifica jogadores únicos';
exemplo de dados: (1, DJJoaoo, license:dbf74f2868625d233c06e3fbd65712faabeb0651, license2:dbf74f2868625d233c06e3fbd65712faabeb0651, fivem:13819817, discord:155474516909359104)




-- Create simplified table structure
CREATE TABLE IF NOT EXISTS `character_fixed_ids` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `citizenid` VARCHAR(50) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `unique_citizenid` (`citizenid`),
    CONSTRAINT `fk_character_citizenid` FOREIGN KEY (`citizenid`) 
        REFERENCES `players` (`citizenid`) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1000 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Fixed ID system using auto-increment + prefix. Fixed ID = CONCAT("EL", id)';
exemplo de dados: (0, Z86VDC7D, 2025-10-24 02:37:55, 2025-11-02 23:19:26)


CREATE TABLE IF NOT EXISTS `players` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `citizenid` varchar(50) NOT NULL,
  `cid` int(11) DEFAULT NULL,
  `license` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `money` text NOT NULL,
  `charinfo` text DEFAULT NULL,
  `job` text NOT NULL,
  `gang` text DEFAULT NULL,
  `position` text NOT NULL,
  `metadata` text NOT NULL,
  `inventory` longtext DEFAULT NULL,
  `phone_number` VARCHAR(20) DEFAULT NULL,
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`citizenid`),
  KEY `id` (`id`),
  KEY `last_updated` (`last_updated`),
  KEY `license` (`license`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `players`
ADD COLUMN IF NOT EXISTS `last_logged_out` timestamp NULL DEFAULT NULL AFTER `last_updated`,
MODIFY COLUMN `name` varchar(255) NOT NULL COLLATE utf8mb4_unicode_ci;

ALTER TABLE `players`
ADD COLUMN IF NOT EXISTS `userId` INT UNSIGNED DEFAULT NULL AFTER `id`;
exemplo de dados: ("id","userId","citizenid","cid","license","name","money","charinfo","job","gang","position","metadata","inventory","phone_number","last_updated","last_logged_out","apps","widget","bt","cryptocurrency","cryptocurrencytransfers","crypto_wallet_id"
"1","1","Y63VZW41","1","license2:dbf74f2868625d233c06e3fbd65712faabeb0651","DJJoaoo","{""crypto"":0,""cash"":26625,""bank"":109437}","{""lastname"":""Coldgrave"",""gender"":0,""firstname"":""Vessel"",""nationality"":""American"",""cid"":1,""phone"":""3733142153"",""birthdate"":""2006-12-30"",""account"":""US07QBX9246418928"",""backstory"":""placeholder backstory""}","{""isboss"":false,""bankAuth"":false,""name"":""mechanic"",""label"":""Mechanic"",""onduty"":false,""payment"":25,""type"":""mechanic"",""grade"":{""name"":""Novice"",""level"":1}}","{""isboss"":false,""bankAuth"":false,""name"":""none"",""label"":""No Gang"",""grade"":{""name"":""Unaffiliated"",""level"":0}}","{""x"":-1693.2659912109376,""y"":455.19561767578127,""z"":131.22119140625,""w"":124.72441101074219}","{""ishandcuffed"":false,""attachmentcraftingrep"":0,""armor"":0,""thirst"":4.0,""craftingrep"":0,""licences"":{""driver"":true,""weapon"":false,""id"":true},""bloodtype"":""AB+"",""attributes"":{""weapon_damage"":{""additional"":0,""multiplier"":1.2,""base"":1},""health_regen"":{""additional"":1,""multiplier"":1,""base"":0},""damage_resistance"":{""additional"":0,""multiplier"":1,""base"":1},""shooting"":{""additional"":0,""multiplier"":1,""base"":100},""lung_capacity"":{""additional"":10,""multiplier"":1,""base"":10},""run_speed"":{""additional"":0,""multiplier"":1.12,""base"":1},""swim_speed"":{""additional"":0,""multiplier"":1.3,""base"":1},""melee_damage"":{""additional"":0,""multiplier"":1.3,""base"":1},""stamina"":{""additional"":30,""multiplier"":1,""base"":100},""recoil_control"":{""additional"":0,""multiplier"":1,""base"":1},""health"":{""additional"":180,""multiplier"":1,""base"":500},""armor"":{""additional"":0,""multiplier"":1,""base"":0},""swimming"":{""additional"":0,""multiplier"":1,""base"":100}},""dealerrep"":0,""injail"":0,""status"":[],""walletid"":""QB-45205967"",""tracker"":false,""criminalrecord"":{""hasRecord"":false},""isdead"":false,""hasCompletedIntro"":true,""health"":680,""stress"":0,""hasSeenIntro"":true,""introSetChoice"":""puro"",""bagBonus"":50000,""jailitems"":[],""inside"":{""apartment"":[]},""inlaststand"":false,""playerState"":1,""callsign"":""NO CALLSIGN"",""max_health"":600,""maxHealth"":680,""phone"":[],""phonedata"":{""InstalledApps"":[],""SerialNumber"":26431632},""hunger"":4.0,""fingerprint"":""88DL59FO4H95G3S"",""jobrep"":{""trucker"":0,""tow"":0,""taxi"":0,""hotdog"":0},""halloween_cooldowns"":{""house_71"":1762298477,""house_66"":1762298431,""house_93"":1762298306}}","[...]",NULL,"2025-12-22 06:02:29","2025-12-22 06:02:29",NULL,NULL,NULL,NULL,NULL,NULL)



