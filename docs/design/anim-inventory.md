# 애니메이션 보유 목록 (EV-50)

`node build/lab/anim-inventory.mjs`가 만든다. 캐릭터 파일 `assets/character_game.glb`의 클립 133개와 게임이 그 클립을 부르는 이름이다.

- 루트 이동: 엉덩이 뼈가 처음과 끝에서 수평으로 움직인 거리다. 0이 아니면 클립이 몸을 옮긴다(이름의 _RM과 같다).
- 게임 이름의 UB_ 마스크는 상체만 쓰는 판이다(UPPER 25개).

## 상호작용별 대조

| 상호작용 | 있는 클립 |
|---|---|
| 경사 보행 | **없음** |
| 계단 | **없음** |
| 좁은 길 비켜 가기 | Strafe_left, Strafe_right |
| 문 열기 | **없음** |
| 앉기 (벤치) | Sitting_Enter, Sitting_Exit, Sitting_Idle, Sitting_Talking |
| 차 승하차 | **없음** |
| 운전 자세 | Driving |
| 물건 들기 | PickUp_Table, Walk_Carry |
| 밀기 | Push |
| 넘어짐·일어나기 | LayToIdle, Zombie_Rise |
| 수영 | Swim_Fwd, Swim_Idle |
| 사다리 | Climb_Ladder, Ladder_Idle |
| 전화 | Idle_TalkingPhone |
| 총 조준·사격 | Pistol_Aim_Down, Pistol_Aim_Neutral, Pistol_Aim_Up, Pistol_Idle, Pistol_Reload, Pistol_Shoot |
| 근접 공격 | Fighting_Idle, Fighting_Left_Jab, Fighting_Right_Jab, Idle_Sword, Melee_Hook, Melee_Hook_Rec, Punch_Cross, Punch_Jab 외 5 |

## 클립 표

| 클립 | 길이 s | 키 | 루트 이동 m | 게임 이름 |
|---|---|---|---|---|
| Angry | 0.83 | 494 | 0 | U_Angry |
| Bow | 3.75 | 838 | 0 | U_Bow |
| Cheer_One_arm | 2.17 | 3232 | 0 | U_Cheer_One_arm (+UB_) |
| Cheering_Two_Hands | 1.58 | 1826 | 0 | U_Cheering_Two_Hands (+UB_) |
| Chest_Open | 1.38 | 1094 | 0 | U_Chest_Open |
| Chop_Tree | 0.96 | 882 | 0 | U_Chop_Tree |
| Climb_Ladder | 3.63 | 5404 | 0 | U_Climb_Ladder |
| Climb_Wall | 2.08 | 2918 | 0 | U_Climb_Wall |
| ClimbUp_1m_RM | 0.67 | 916 | 0 | U_ClimbUp_1m_RM |
| Confused | 2.92 | 2446 | 0 | U_Confused (+UB_) |
| Consume | 1.33 | 1095 | 0 | U_Consume (+UB_) |
| Consume_Item | 4.17 | 2290 | 0 | U_Consume_Item (+UB_) |
| Crawl | 1.71 | 1616 | 0 | U_Crawl |
| Crawl_RM | 1.71 | 1657 | 1.31 | U_Crawl_RM |
| Crouch_Idle | 3.67 | 3962 | 0 | U_Crouch_Idle |
| Crouch_Walk | 2.5 | 1137 | 0 | U_Crouch_Fwd |
| Dance_Body_Roll | 6.5 | 9682 | 0 | U_Dance_Body_Roll |
| Dance_Simple | 1.25 | 685 | 0 | U_Dance |
| Death_A | 4.5 | 5328 | 0.68 | U_Death01 |
| Death_B | 1.88 | 1940 | 0.63 | U_Death_B |
| Death_C | 2.21 | 2378 | 0.83 | U_Death_C |
| Death_D | 2.17 | 2684 | 0.82 | U_Death_D |
| Defend | 0.96 | 512 | 0 | U_Defend (+UB_) |
| Dizzy | 2.42 | 1142 | 0 | U_Dizzy |
| Driving | 2.08 | 624 | 0 | U_Driving |
| Farm_Harvest | 2.33 | 1949 | 0 | U_Farm_Harvest |
| Farm_PlantSeed | 2.79 | 1850 | 0 | U_Farm_PlantSeed |
| Farm_Watering | 3.83 | 1772 | 0 | U_Farm_Watering |
| Fighting_Idle | 1.71 | 680 | 0 | U_Fighting_Idle |
| Fighting_Left_Jab | 0.92 | 574 | 0 | U_Fighting_Left_Jab |
| Fighting_Right_Jab | 0.92 | 454 | 0 | U_Fighting_Right_Jab |
| Fishing_Cast | 2.95 | 3478 | 0.02 | U_Fishing_Cast |
| Fishing_Catch | 2.05 | 2574 | 0.02 | U_Fishing_Catch |
| Fishing_Reel | 1.45 | 1768 | 0 | U_Fishing_Reel |
| Fixing_Kneeling | 6.5 | 7884 | 0 | U_Fixing_Kneeling |
| Golf_Drive | 3.1 | 4389 | 0.08 | U_Golf_Drive |
| Golf_idle | 1.83 | 1878 | 0 | U_Golf_idle |
| Greeting | 4.83 | 5948 | 0 | U_Greeting (+UB_) |
| Head_Nod | 0.88 | 191 | 0 | U_Head_Nod (+UB_) |
| Help_One_Arm | 2.67 | 3157 | 0 | U_Help_One_Arm (+UB_) |
| Help_Two_Arms | 1.58 | 1826 | 0 | U_Help_Two_Arms (+UB_) |
| Hit_Chest | 0.42 | 539 | 0 | U_Hit_Chest |
| Hit_Head | 0.54 | 662 | 0 | U_Hit_Head |
| Hit_Knockback | 0.83 | 1046 | 0 | U_Hit_Knockback |
| Hit_Knockback_RM | 0.63 | 822 | 2.96 | U_Hit_Knockback_RM |
| Idle_A | 3.13 | 1392 | 0 | Idle, U_Idle |
| Idle_FoldArms | 2.5 | 960 | 0 | U_Idle_FoldArms (+UB_) |
| Idle_Hurt | 1.67 | 1122 | 0 | U_Idle_Hurt |
| Idle_Lantern | 2.5 | 1137 | 0 | U_Idle_Lantern |
| Idle_Listening | 1.71 | 836 | 0 | U_Idle_Listening (+UB_) |
| Idle_Rail | 2.5 | 960 | 0 | U_Idle_Rail |
| Idle_Rail_Call | 2.5 | 1845 | 0 | U_Idle_Rail_Call (+UB_) |
| Idle_ShakeOff | 2.5 | 1196 | 0 | U_Idle_ShakeOff |
| Idle_Subtle | 2.58 | 914 | 0 | U_Idle_Subtle |
| Idle_Sword | 2.08 | 1555 | 0 | U_Idle_Sword |
| Idle_Talking | 3.67 | 3701 | 0 | U_Idle_Talking |
| Idle_TalkingPhone | 2.92 | 1997 | 0 | U_Idle_TalkingPhone (+UB_) |
| Idle_Torch | 1.58 | 800 | 0 | U_Idle_Torch |
| Insult | 2.78 | 7438 | 0 | U_Insult (+UB_) |
| Interact | 2.5 | 1255 | 0 | U_Interact |
| Jog | 1.17 | 647 | 0 | Run, U_Jog_Fwd |
| Jump_2 | 1.63 | 800 | 0.11 | U_Jump_2 |
| Jump_air | 3.13 | 1318 | 0 | U_Jump |
| Jump_Land | 1.58 | 1947 | 0.06 | U_Jump_Land |
| Jump_Start | 1.67 | 1967 | 0.35 | U_Jump_Start |
| Jumping_Jacks | 1.25 | 750 | 0.01 | U_Jumping_Jacks |
| Kick_Breach | 1.83 | 2423 | 0 | U_Kick_Breach |
| Kneeling_Tired | 0.83 | 458 | 0 | U_Kneeling_Tired |
| Ladder_Idle | 2.5 | 888 | 0 | U_Ladder_Idle |
| Land_Three_Point | 1.38 | 1963 | 4.37 | U_Land_Three_Point |
| LayToIdle | 1.5 | 1849 | 0.83 | U_LayToIdle |
| Ledge_Hang | 1.92 | 1278 | 0 | U_Ledge_Hang |
| Meditate | 1.5 | 440 | 0 | U_Meditate |
| Melee_Hook | 0.46 | 354 | 0.21 | U_Melee_Hook |
| Melee_Hook_Rec | 0.58 | 368 | 0.27 | U_Melee_Hook_Rec |
| OverhandThrow | 1.33 | 1715 | 0 | U_OverhandThrow (+UB_) |
| PickUp_Table | 1.04 | 830 | 0 | U_PickUp_Table |
| Pipe_Climb | 1.88 | 1037 | 0 | U_Pipe_Climb |
| Pistol_Aim_Down | 0.21 | 134 | 0 | U_Pistol_Aim_Down |
| Pistol_Aim_Neutral | 0.21 | 134 | 0 | U_Pistol_Aim_Neutral |
| Pistol_Aim_Up | 0.21 | 134 | 0 | U_Pistol_Aim_Up |
| Pistol_Idle | 2.08 | 575 | 0 | U_Pistol_Idle |
| Pistol_Reload | 2.08 | 1800 | 0 | U_Pistol_Reload |
| Pistol_Shoot | 0.79 | 260 | 0 | U_Pistol_Shoot |
| Punch_Cross | 1.25 | 656 | 0 | U_Punch_Cross |
| Punch_Jab | 1.08 | 534 | 0 | U_Punch_Jab |
| Push | 3.33 | 1556 | 0 | U_Push |
| Pushup | 1.54 | 939 | 0 | U_Pushup |
| Reject | 3.79 | 4851 | 0 | U_Reject (+UB_) |
| Rest_Pose | 0.42 | 134 | 0 | TPose |
| Roll | 1.83 | 2241 | 0.37 | U_Roll |
| Run_Female | 0.83 | 602 | 0.02 | U_Run_Female |
| Run_Jump | 1.25 | 470 | 0 | U_Run_Jump |
| Run_Stealth | 0.54 | 354 | 0.01 | U_Run_Stealth |
| Salute | 4.38 | 4588 | 0 | U_Salute (+UB_) |
| Shivering | 0.25 | 194 | 0 | U_Shivering |
| Sitting_Enter | 1.63 | 1958 | 0.34 | U_Sitting_Enter |
| Sitting_Exit | 1.29 | 1574 | 0.34 | U_Sitting_Exit |
| Sitting_Idle | 2.08 | 1359 | 0 | U_Sitting_Idle |
| Sitting_Talking | 3.67 | 3440 | 0 | U_Sitting_Talking |
| Sleeping | 1.67 | 552 | 0 | U_Sleeping |
| Sprint | 0.83 | 495 | 0 | U_Sprint |
| Strafe_left | 1 | 530 | 0 | U_Strafe_left |
| Strafe_right | 1 | 530 | 0 | U_Strafe_right |
| Swim_Fwd | 1.67 | 875 | 0 | U_Swim_Fwd |
| Swim_Idle | 4.17 | 4391 | 0 | U_Swim_Idle |
| Sword_Attack | 1.92 | 1079 | 0 | U_Sword_Attack (+UB_) |
| Sword_Block | 1.25 | 1062 | 0 | U_Sword_Block (+UB_) |
| Sword_Regular_A | 0.46 | 494 | 0 | U_Sword_Regular_A (+UB_) |
| Sword_Regular_B | 0.54 | 566 | 0 | U_Sword_Regular_B (+UB_) |
| Sword_Regular_C | 1.67 | 1538 | 0.29 | U_Sword_Regular_C (+UB_) |
| Throw_Object | 1.88 | 1854 | 0.07 | U_Throw_Object (+UB_) |
| Tired_Hunched | 1.04 | 502 | 0 | U_Tired_Hunched |
| Turn_Left_180 | 2.12 | 2276 | 0.03 | U_Turn_Left_180 |
| Turn_Left_90 | 2 | 2514 | 0.19 | U_Turn_Left_90 |
| Turn_Right_180 | 1.48 | 4534 | 0.11 | U_Turn_Right_180 |
| Turn_Right_90 | 2 | 2395 | 0.05 | U_Turn_Right_90 |
| Victory | 1.67 | 1046 | 0 | U_Victory |
| Victory_Fist_Pump | 2.25 | 2214 | 0 | U_Victory_Fist_Pump |
| Walk | 1.67 | 992 | 0 | Walk, U_Walk |
| Walk_Backwards | 1 | 596 | 0 | U_Walk_Backwards |
| Walk_Carry | 2 | 933 | 0 | U_Walk_Carry |
| Walk_Female | 1.38 | 1932 | 0.01 | U_Walk_Female |
| Walk_Formal | 1.67 | 875 | 0 | U_Walk_Formal |
| Walk_Stealth | 1.5 | 746 | 0 | U_Walk_Stealth |
| Yes | 2.5 | 1432 | 0 | U_Yes (+UB_) |
| Zombie_Idle | 1.33 | 1653 | 0 | U_Zombie_Idle |
| Zombie_Idle_Crouch | 2.96 | 1997 | 0 | U_Zombie_Idle_Crouch |
| Zombie_Rise | 3.38 | 4400 | 1.14 | U_Zombie_Rise |
| Zombie_Scratch | 1.79 | 2066 | 0 | U_Zombie_Scratch |
| Zombie_Walk | 1.33 | 816 | 0 | U_Zombie_Walk |
| Zombie_Walk_2 | 2.92 | 1698 | 0 | U_Zombie_Walk_2 |
| Zombie_Yell | 3.71 | 5180 | 0 | U_Zombie_Yell |

## 게임이 부르지만 파일에 없는 클립

없음.

## 쓰이지 않는 클립

0개: 없음
