var Q=Object.defineProperty;var Z=(u,c,e)=>c in u?Q(u,c,{enumerable:!0,configurable:!0,writable:!0,value:e}):u[c]=e;var n=(u,c,e)=>Z(u,typeof c!="symbol"?c+"":c,e);import{P as d}from"./phaser-skL0-YrO.js";const L={width:{value:720},height:{value:1280}},R={debug:{value:!1}},ee={pixelArt:{value:!0}},_={flapPower:{value:450},gravity:{value:1200},maxFallSpeed:{value:600},rotationSpeed:{value:.003}},f={tubeSpawnInterval:{value:2200},tubeScrollSpeed:{value:180},tubeGapSize:{value:310},tokenSpawnChance:{value:.5},goldenBearTokenChance:{value:.15},pointsPerTube:{value:1},pointsPerXRPToken:{value:2.5},pointsPerGoldenBearToken:{value:5},difficultyIncreaseInterval:{value:4},speedIncreasePerLevel:{value:20},gapDecreasePerLevel:{value:12},minGapSize:{value:140},tubeSpawnVariance:{value:600},spawnIntervalDecreasePerLevel:{value:120},minSpawnInterval:{value:1e3},timeBasedSpeedIncreaseInterval:{value:8e3},timeBasedSpeedIncrease:{value:8}},V={enemySpawnChance:{value:.1},enemySpawnIncreasePerLevel:{value:.12},maxEnemySpawnChance:{value:.8}},I={jesterHatSpawnChance:{value:.08},jesterHatDuration:{value:5e3},jesterHatSpeedMultiplier:{value:2},magnetSpawnChance:{value:.12},magnetDuration:{value:6e3},magnetRadius:{value:300},magnetAttractionSpeed:{value:800}},X={nearMissDistance:{value:50},nearMissPoints:{value:3}},te={bossTriggerScore:{value:123}};class se extends Phaser.Scene{constructor(){super("Preloader")}preload(){this.setupLoadingProgressUI(this),this.load.pack("assetPack","assets/asset-pack.json")}create(){this.scene.start("TitleScreen")}setupLoadingProgressUI(c){const e=c.cameras.main,t=e.width,s=e.height,i=Math.floor(t*.6),o=20,a=Math.floor((t-i)/2),r=Math.floor(s*.5),l=c.add.graphics();l.fillStyle(2236962,.8),l.fillRect(a-4,r-4,i+8,o+8);const h=c.add.graphics(),p=c.add.text(t/2,r-20,"Loading...",{fontSize:"20px",color:"#ffffff",stroke:"#000000",strokeThickness:3}).setOrigin(.5,.5),m=v=>{h.clear(),h.fillStyle(16777215,1),h.fillRect(a,r,i*v,o)},g=()=>{y()};c.load.on("progress",m),c.load.once("complete",g);const y=()=>{c.load.off("progress",m),h.destroy(),l.destroy(),p.destroy()}}}const ie="modulepreload",oe=function(u){return"/"+u},q={},K=function(c,e,t){let s=Promise.resolve();if(e&&e.length>0){let o=function(l){return Promise.all(l.map(h=>Promise.resolve(h).then(p=>({status:"fulfilled",value:p}),p=>({status:"rejected",reason:p}))))};document.getElementsByTagName("link");const a=document.querySelector("meta[property=csp-nonce]"),r=(a==null?void 0:a.nonce)||(a==null?void 0:a.getAttribute("nonce"));s=o(e.map(l=>{if(l=oe(l),l in q)return;q[l]=!0;const h=l.endsWith(".css"),p=h?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${l}"]${p}`))return;const m=document.createElement("link");if(m.rel=h?"stylesheet":ie,h||(m.as="script"),m.crossOrigin="",m.href=l,r&&m.setAttribute("nonce",r),document.head.appendChild(m),h)return new Promise((g,y)=>{m.addEventListener("load",g),m.addEventListener("error",()=>y(new Error(`Unable to preload CSS for ${l}`)))})}))}function i(o){const a=new Event("vite:preloadError",{cancelable:!0});if(a.payload=o,window.dispatchEvent(a),!a.defaultPrevented)throw o}return s.then(o=>{for(const a of o||[])a.status==="rejected"&&i(a.reason);return c().catch(i)})},U=(u,c)=>{const e=u.add.dom(0,0,"div","width: 100%; height: 100%;").setHTML(c);return e.pointerEvents="none",e.setOrigin(0,0),e.setScrollFactor(0),e},O=(u,c)=>{const e=u.scene.cache.json.get("animations");if(e){if(!e.anims)throw new Error("the first key of animations.json must be 'anims', please check the file")}else throw new Error("animations.json is not loaded, please check if the file is in the assets folder");let t=.5,s=1;const i=u.anims.currentAnim;if(i){const p=e.anims.find(m=>m.key===i.key);p?(t=p.originX||.5,s=p.originY||1):console.error(`Animation config not found for key: ${i.key}`)}let o=t,a=s;u.setOrigin(o,a);const r=u.body,l=r.sourceWidth,h=r.sourceHeight;r.setOffset(u.width*o-l/2,u.height*a-h)},b=(u,c,e,t,s,i)=>{u.setOrigin(c.x,c.y);let o,a,r;if(t&&e)u.height/u.width>t/e?(a=t,o=t/u.height,r=u.width*o):(r=e,o=e/u.width,a=u.height*o);else if(t)a=t,o=t/u.height,r=u.width*o;else if(e)r=e,o=e/u.width,a=u.height*o;else throw new Error("initScale input parameter maxDisplayHeight and maxDisplayWidth cannot be undefined at the same time");u.setScale(o);const l=r*s,h=a*i;if(u.body instanceof d.Physics.Arcade.Body){const p=l/o,m=h/o;u.body.setSize(p,m);const g=u.width*c.x-p*c.x,y=u.height*c.y-m*c.y;u.body.setOffset(g,y)}else if(u.body instanceof d.Physics.Arcade.StaticBody){u.body.setSize(l,h);const p=u.getTopLeft(),m=p.x+(u.displayWidth*c.x-l*c.x),g=p.y+(u.displayHeight*c.y-h*c.y);u.body.position.set(m,g)}},k=(u,c,e,t,s,i)=>ae(c,e)?u.physics.add.overlap(c,e,(o,a)=>{t==null||t.call(i,a,o)},(o,a)=>{},i):u.physics.add.overlap(c,e,t,s,i),ae=(u,c)=>{const e=u&&u.isParent&&u.physicsType!==void 0,t=u&&u.isTilemap,s=c&&c.isParent&&c.physicsType!==void 0,i=c&&c.isTilemap;return e&&!s&&!i||t&&!s&&!i||t&&s},A=class A{constructor(){n(this,"music",null);n(this,"bossMusic",null);n(this,"isMuted",!1);n(this,"scene",null);n(this,"isBossTheme",!1)}static getInstance(){return A.instance||(A.instance=new A),A.instance}init(c){this.scene=c,this.music||(this.music=c.sound.add("custom_background_music",{volume:this.isMuted?0:.6,loop:!0}))}play(){this.isBossTheme?this.bossMusic&&!this.bossMusic.isPlaying&&this.bossMusic.play():this.music&&!this.music.isPlaying&&this.music.play()}playBossTheme(c){this.music&&this.music.isPlaying&&this.music.stop(),this.isBossTheme=!0,this.scene=c,!this.bossMusic&&c.cache.audio.exists("boss_battle_theme")&&(this.bossMusic=c.sound.add("boss_battle_theme",{volume:this.isMuted?0:.6,loop:!0})),this.bossMusic&&!this.bossMusic.isPlaying&&this.bossMusic.play()}toggleMute(){return this.isMuted=!this.isMuted,this.music&&"setVolume"in this.music&&this.music.setVolume(this.isMuted?0:.6),this.isMuted}isMusicMuted(){return this.isMuted}setMuted(c){this.isMuted=c,this.music&&"setVolume"in this.music&&this.music.setVolume(this.isMuted?0:.6),this.bossMusic&&"setVolume"in this.bossMusic&&this.bossMusic.setVolume(this.isMuted?0:.6)}setVolume(c){this.music&&"setVolume"in this.music&&this.music.setVolume(c)}stop(){this.music&&this.music.isPlaying&&this.music.stop(),this.bossMusic&&this.bossMusic.isPlaying&&this.bossMusic.stop(),this.isBossTheme=!1}destroy(){this.music&&(this.music.destroy(),this.music=null),this.bossMusic&&(this.bossMusic.destroy(),this.bossMusic=null)}};n(A,"instance");let C=A;class ne extends d.Scene{constructor(){super({key:"TitleScreen"});n(this,"uiContainer");n(this,"keydownHandler");n(this,"clickHandler");n(this,"backgroundMusic");n(this,"isStarting",!1);n(this,"bestScore",0);n(this,"totalXRP",0);n(this,"totalGoldenBears",0);this.isStarting=!1}init(){this.isStarting=!1,this.bestScore=parseInt(localStorage.getItem("flappyBearBestScore")||"0"),this.totalXRP=parseInt(localStorage.getItem("flappyBearTotalXRP")||"0"),this.totalGoldenBears=parseInt(localStorage.getItem("flappyBearTotalGoldenBears")||"0")}create(){this.createBackground(),this.initializeSounds(),this.createDOMUI(),this.setupInputs(),this.playBackgroundMusic(),this.events.once("shutdown",()=>{this.cleanupEventListeners()})}createBackground(){const e=this.add.image(this.scale.width/2,this.scale.height/2,"title_screen_background");e.setOrigin(.5,.5);const t=this.scale.width/e.width,s=this.scale.height/e.height,i=Math.max(t,s);e.setScale(i),e.setScrollFactor(0),e.setDepth(-10)}createDOMUI(){let e=`
      <div id="title-screen-container" class="fixed top-0 left-0 w-full h-full pointer-events-none z-[1000] font-supercell flex flex-col justify-between items-center">
        <!-- Gradient Overlay for better readability -->
        <div class="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none"></div>
        

        
        <!-- Mute Button (Top Right) -->
        <div class="absolute top-8 right-8 z-[1001]">
          <button id="mute-button" class="game-3d-container-clickable-[#FFD700] px-6 py-4 pointer-events-auto cursor-pointer hover:scale-110 transition-transform" style="min-width: 80px;">
            <div class="text-amber-900 font-bold text-center" style="font-size: 32px; text-shadow: 1px 1px 0px rgba(255,255,255,0.3);">
              <span id="mute-icon">MUTE</span>
            </div>
          </button>
        </div>
        
        <!-- Main Content Container -->
        <div class="flex flex-col justify-between w-full h-full relative z-10 py-8">
          
          <!-- Top Section - Game Title -->
          <div class="flex-1 flex flex-col items-center justify-center">
            <div id="game-title-container" class="flex-shrink-0 flex items-center justify-center">
              <img id="game-title-image" 
                   src="https://cdn-gambo-public.gambo.ai/assets/bOrJvKX990-4wH9aHMUqQ.png" 
                   alt="Flappy $Bear" 
                   class="max-h-[1000px] mx-20 object-contain pointer-events-none"
                   style="filter: drop-shadow(8px 8px 16px rgba(0,0,0,0.9)); animation: titleFloat 3s ease-in-out infinite;" />
            </div>
          </div>
          
          <!-- Bottom Section - Play Button and Stats -->
          <div class="flex flex-col items-center gap-6">
            <!-- Play Button -->
            <button id="play-button" class="game-3d-container-clickable-[#FFD700] px-20 py-6 pointer-events-auto cursor-pointer transition-all" style="
              min-width: 400px;
              animation: playButtonPulse 2s ease-in-out infinite;
            ">
              <div class="flex items-center justify-center gap-4">
                <div class="text-amber-900 font-bold text-center" style="font-size: 56px; text-shadow: 2px 2px 0px rgba(255,255,255,0.3);">
                  PLAY
                </div>
              </div>
            </button>
            
            <!-- Stats Container -->
            <div class="flex gap-4 items-stretch justify-center">
            <!-- Best Score -->
            <div class="game-3d-container-[#2C3E50] px-10 py-5" style="min-width: 260px;">
              <div class="text-yellow-400 font-bold" style="font-size: 20px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
                BEST SCORE
              </div>
              <div class="text-white font-bold" style="font-size: 48px; text-shadow: 4px 4px 0px rgba(0,0,0,0.5); background: linear-gradient(180deg, #FFD700 0%, #FFA500 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                ${this.bestScore}
              </div>
            </div>
            
            <!-- Total XRP and $BEAR Collected -->
            <div class="game-3d-container-[#6B46C1] px-8 py-5" style="min-width: 360px;">
              <div class="text-yellow-300 font-bold mb-3" style="font-size: 18px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
                TOTAL XRP & BEAR COLLECTED
              </div>
              <div class="flex gap-6 justify-center">
                <!-- XRP Count -->
                <div class="flex flex-col items-center">
                  <div class="text-gray-200" style="font-size: 16px; text-shadow: 1px 1px 0px rgba(0,0,0,0.5);">
                    XRP
                  </div>
                  <div class="text-white font-bold" style="font-size: 40px; text-shadow: 3px 3px 0px rgba(0,0,0,0.5); background: linear-gradient(180deg, #9370DB 0%, #6B46C1 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                    ${this.totalXRP}
                  </div>
                </div>
                <!-- Golden Bear Count -->
                <div class="flex flex-col items-center">
                  <div class="text-gray-200" style="font-size: 16px; text-shadow: 1px 1px 0px rgba(0,0,0,0.5);">
                    BEAR
                  </div>
                  <div class="text-white font-bold" style="font-size: 40px; text-shadow: 3px 3px 0px rgba(0,0,0,0.5); background: linear-gradient(180deg, #FFD700 0%, #FFA500 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                    ${this.totalGoldenBears}
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>

        </div>

        <!-- Custom Animations and Styles -->
        <style>
          @keyframes titleBlink {
            from { opacity: 0.4; }
            to { opacity: 1; }
          }
          
          @keyframes titleFloat {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
          }
          
          @keyframes playButtonPulse {
            0%, 100% { transform: scale(1); box-shadow: 0 0 20px rgba(255, 215, 0, 0.6); }
            50% { transform: scale(1.05); box-shadow: 0 0 40px rgba(255, 215, 0, 0.9); }
          }
          

          
          #play-button:hover {
            transform: scale(1.1) !important;
            box-shadow: 0 0 50px rgba(255, 215, 0, 1) !important;
          }
          
          #play-button:active {
            transform: scale(0.95) !important;
          }
        </style>
      </div>
    `;this.uiContainer=U(this,e),this.setupMuteButton(),this.setupPlayButton()}setupMuteButton(){if(!this.uiContainer||!this.uiContainer.node)return;const e=this.uiContainer.node.querySelector("#mute-button"),t=this.uiContainer.node.querySelector("#mute-icon");if(e&&t){const s=localStorage.getItem("flappyBearAllSoundsMuted")==="true";t.textContent=s?"UNMUTE":"MUTE",s&&(this.sound.mute=!0,C.getInstance().setMuted(!0)),e.addEventListener("click",i=>{i.preventDefault(),i.stopPropagation();const o=!this.sound.mute;this.sound.mute=o,C.getInstance().setMuted(o),t.textContent=o?"UNMUTE":"MUTE",localStorage.setItem("flappyBearAllSoundsMuted",o.toString()),o||this.sound.play("ui_click",{volume:.3})})}}setupPlayButton(){if(!this.uiContainer||!this.uiContainer.node)return;const e=this.uiContainer.node.querySelector("#play-button");e&&e.addEventListener("click",t=>{t.preventDefault(),t.stopPropagation(),this.startGame()})}setupInputs(){var o,a;this.input.on("pointerdown",()=>{this.startGame()});const e=(o=this.input.keyboard)==null?void 0:o.addKey(d.Input.Keyboard.KeyCodes.SPACE),t=(a=this.input.keyboard)==null?void 0:a.addKey(d.Input.Keyboard.KeyCodes.ENTER);e&&e.on("down",()=>{this.startGame()}),t&&t.on("down",()=>{this.startGame()});const s=r=>{r.preventDefault(),this.startGame()},i=r=>{(r.code==="Enter"||r.code==="Space")&&(r.preventDefault(),this.startGame())};document.addEventListener("keydown",i),this.uiContainer&&this.uiContainer.node&&this.uiContainer.node.addEventListener("click",s),this.keydownHandler=i,this.clickHandler=s}initializeSounds(){C.getInstance().init(this)}playBackgroundMusic(){C.getInstance().play()}startGame(){this.isStarting||(this.isStarting=!0,this.sound.play("ui_click",{volume:.3}),console.log("🎮 STARTING NEW GAME - Resetting all game state"),localStorage.setItem("flappyBearSpeedMultiplier","1.0"),localStorage.setItem("flappyBearAccumulatedScore","0"),localStorage.setItem("flappyBearBossesDefeated","0"),localStorage.setItem("flappyBearLastBossVictoryScore","0"),console.log("✅ Game state reset: Speed=1.0x, Score=0, Bosses=0"),this.cleanupEventListeners(),this.cameras.main.fadeOut(500,0,0,0),this.time.delayedCall(500,()=>{console.log("🎮 TITLE SCREEN START - AGGRESSIVE BOSS BONUS CLEARING"),K(()=>Promise.resolve().then(()=>$),void 0).then(e=>{e.default.aggressiveClearBossBonuses()}),localStorage.removeItem("flappyBearSpeedMultiplier"),localStorage.removeItem("flappyBearAccumulatedScore"),sessionStorage.removeItem("flappyBearSpeedMultiplier"),sessionStorage.removeItem("flappyBearAccumulatedScore"),console.log("💥 TITLE START: All boss bonuses ELIMINATED - starting fresh"),this.scene.start("GameScene")}))}cleanupEventListeners(){this.keydownHandler&&document.removeEventListener("keydown",this.keydownHandler),this.clickHandler&&this.uiContainer&&this.uiContainer.node&&this.uiContainer.node.removeEventListener("click",this.clickHandler)}update(){}}class z extends d.Physics.Arcade.Sprite{constructor(e,t,s){super(e,t,s,"bear_idle_frame1");n(this,"flapPower");n(this,"gravity");n(this,"maxFallSpeed");n(this,"rotationSpeed");n(this,"isDead");n(this,"isFlapping");n(this,"maxHealth",3);n(this,"health",3);n(this,"isInvulnerable",!1);n(this,"hasJesterHat");n(this,"jesterHatStacks");n(this,"jesterHatTimer");n(this,"powerUpAura");n(this,"powerUpStars");n(this,"powerUpEffectObjects");n(this,"normalScale");n(this,"hasMagnet");n(this,"magnetTimer");n(this,"magnetEffectObjects");n(this,"particleTrail");n(this,"flapSound");e.add.existing(this),e.physics.add.existing(this),this.flapPower=_.flapPower.value,this.gravity=_.gravity.value,this.maxFallSpeed=_.maxFallSpeed.value,this.rotationSpeed=_.rotationSpeed.value,this.forceReset(),this.body.setGravityY(this.gravity),this.body.setMaxVelocity(1e3,this.maxFallSpeed),b(this,{x:.5,y:.5},void 0,128,.6,.7),this.normalScale=this.scale,this.initializeSounds(),this.createParticleTrail(),this.play("bear_idle_anim"),console.log("🐻 FRESH BEAR CREATED - Health:",this.health,"isDead:",this.isDead,"isInvulnerable:",this.isInvulnerable)}forceReset(){console.log("🔄 FORCE RESETTING BEAR STATE"),this.powerUpEffectObjects=this.powerUpEffectObjects||[],this.magnetEffectObjects=this.magnetEffectObjects||[],this.jesterHatTimer&&(this.jesterHatTimer.remove(),this.jesterHatTimer=void 0),this.magnetTimer&&(this.magnetTimer.remove(),this.magnetTimer=void 0),this.removePowerUpEffect(),this.removeMagnetEffect(),this.isDead=!1,this.isFlapping=!1,this.hasJesterHat=!1,this.jesterHatStacks=0,this.health=this.maxHealth,this.isInvulnerable=!1,this.hasMagnet=!1,this.clearTint(),this.body&&this.body.setVelocity(0,0),console.log("✅ BEAR STATE RESET COMPLETE - Health:",this.health,"isDead:",this.isDead)}initializeSounds(){this.flapSound=this.scene.sound.add("wing_flap",{volume:.3})}takeDamage(e){if(!(this.isInvulnerable||this.isDead))if(console.log(`Bear taking ${e} damage. Health before: ${this.health}`),this.health-=e,console.log(`Bear health after damage: ${this.health}`),this.health<=0){this.health=0,console.log("💀 BEAR DEATH DETECTED - Health <= 0, FORCING IMMEDIATE GAME OVER"),this.die();const t=this.scene;t.handleGameOver&&typeof t.handleGameOver=="function"?(console.log("💀 ULTRA FORCE: Bear died, IMMEDIATELY calling handleGameOver()"),t.gameOver=!0,console.log("💀 CALLING handleGameOver() - ATTEMPT 1"),t.handleGameOver(),setTimeout(()=>{console.log("💀 CALLING handleGameOver() - ATTEMPT 2 (timeout)"),t.handleGameOver()},1),this.scene.time.delayedCall(1,()=>{console.log("💀 CALLING handleGameOver() - ATTEMPT 3 (delayedCall)"),t.handleGameOver()})):(console.log("❌ ERROR: Boss scene doesn't have handleGameOver method!"),console.log("Scene methods:",Object.getOwnPropertyNames(t)))}else this.isInvulnerable=!0,this.setTint(16729156),this.scene.time.delayedCall(1e3,()=>{this.isInvulnerable=!1,this.clearTint()})}die(){this.isDead||(console.log("Bear die() method called"),this.isDead=!0,this.body.setVelocity(0,200),this.setTint(8947848),console.log("Emitting bearDied event"),this.scene.events.emit("bearDied"))}flap(){var i;if(this.isDead)return;const e=this.hasJesterHat?1.15:1,t=this.flapPower*e;this.body.setVelocityY(-t),this.isFlapping=!0;const s=this.hasJesterHat?"bear_jester_flap_anim":"bear_flap_anim";this.play(s,!0),O(this),(i=this.flapSound)==null||i.play(),this.once(`animationcomplete-${s}`,()=>{if(this.isFlapping=!1,!this.isDead){const o=this.hasJesterHat?"bear_jester_idle_anim":"bear_idle_anim";this.play(o,!0),O(this)}})}activateJesterHat(e){if(!this.isDead){if(this.jesterHatStacks>=3){console.log("🎪 Already at max stacks (3), ignoring power-up");return}console.log("🎪 Activating jester hat! Stack count will be:",this.jesterHatStacks+1),this.jesterHatStacks++,this.jesterHatTimer&&this.jesterHatTimer.remove(),this.hasJesterHat=!0,this.isFlapping||(this.play("bear_jester_idle_anim",!0),O(this)),this.createPowerUpEffect(),this.scene.events.emit("jesterHatActivated",this.jesterHatStacks),this.jesterHatTimer=this.scene.time.delayedCall(e,()=>{this.deactivateJesterHat()})}}deactivateJesterHat(){this.hasJesterHat=!1,this.jesterHatStacks=0,this.off("animationcomplete"),this.isFlapping?(this.play("bear_flap_anim",!0),O(this),this.once("animationcomplete-bear_flap_anim",()=>{this.isFlapping=!1,this.isDead||(this.play("bear_idle_anim",!0),O(this))})):(this.play("bear_idle_anim",!0),O(this)),this.removePowerUpEffect(),this.scene.events.emit("jesterHatDeactivated")}createPowerUpEffect(){this.removePowerUpEffect();const e=[16711680,255,16776960];for(let o=0;o<3;o++){const a=o/3*Math.PI*2,r=60,l=this.scene.add.circle(this.x+Math.cos(a)*r,this.y+Math.sin(a)*r,8,e[o],.8);l.setDepth(this.depth-1),this.powerUpEffectObjects.push(l),this.scene.tweens.add({targets:l,scaleX:1.5,scaleY:1.5,alpha:.4,duration:400,yoyo:!0,repeat:-1,ease:"Sine.easeInOut"}),this.scene.tweens.add({targets:l,angle:360,duration:1e3,repeat:-1,ease:"Linear",onUpdate:()=>{if(this.active&&l.active){const h=a+Date.now()/500;l.x=this.x+Math.cos(h)*r,l.y=this.y+Math.sin(h)*r}}})}const t=[16711680,255,16777215];let s=0;const i=this.scene.tweens.addCounter({from:0,to:t.length-1,duration:600,repeat:-1,onUpdate:o=>{if(this.active&&this.hasJesterHat){const a=Math.floor(o.getValue());a!==s&&(s=a,this.setTint(t[s]))}}});this.powerUpEffectObjects.push(i)}removePowerUpEffect(){this.powerUpEffectObjects&&Array.isArray(this.powerUpEffectObjects)&&this.powerUpEffectObjects.forEach(e=>{e&&e.active&&(this.scene.tweens.killTweensOf(e),e.destroy())}),this.powerUpEffectObjects=[],this.powerUpAura=void 0,this.clearTint()}activateMagnet(e){this.isDead||(console.log("🧲 Activating magnet power-up!"),this.magnetTimer&&this.magnetTimer.remove(),this.hasMagnet=!0,this.createMagnetEffect(),this.scene.events.emit("magnetActivated"),this.magnetTimer=this.scene.time.delayedCall(e,()=>{this.deactivateMagnet()}))}deactivateMagnet(){this.hasMagnet=!1,this.removeMagnetEffect(),this.scene.events.emit("magnetDeactivated")}createMagnetEffect(){this.removeMagnetEffect();const e=this.scene.add.circle(this.x,this.y,80,65535,.2);e.setDepth(this.depth-1),e.setStrokeStyle(3,65535,.8),this.magnetEffectObjects.push(e),this.scene.tweens.add({targets:e,scaleX:1.3,scaleY:1.3,alpha:.05,duration:800,yoyo:!0,repeat:-1,ease:"Sine.easeInOut"}),this.scene.events.on("update",()=>{e.active&&this.active&&(e.x=this.x,e.y=this.y)})}removeMagnetEffect(){this.magnetEffectObjects&&Array.isArray(this.magnetEffectObjects)&&this.magnetEffectObjects.forEach(e=>{e&&e.active&&(this.scene.tweens.killTweensOf(e),e.destroy())}),this.magnetEffectObjects=[]}createParticleTrail(){}updateParticleTrail(e,t){if(this.isDead||e<200&&t<3)return;const s=this.scene.add.circle(this.x-20,this.y,4,this.getTrailColor(t),.6);s.setDepth(this.depth-1),this.scene.tweens.add({targets:s,alpha:0,scaleX:.5,scaleY:.5,duration:400,ease:"Power2",onComplete:()=>{s.destroy()}})}getTrailColor(e){return e>=10?16711935:e>=5?16739072:e>=3?16776960:65535}applyRainbowGlow(){if(this.hasJesterHat){const e=[16711680,16739072,16776960,65280,255,16711935],t=Math.floor(Date.now()/200)%e.length;this.setTint(e[t])}else this.clearTint()}updateRotation(){if(this.isDead)return;const e=d.Math.Clamp(this.body.velocity.y*this.rotationSpeed,-.5,.5);this.rotation=e}createFeatherEffect(){this.scene.tweens.add({targets:this,alpha:.5,angle:-90,duration:1e3,ease:"Power2"})}update(e,t,s=0){if(!this.active||!this.body)return;this.updateRotation();const i=Math.abs(this.body.velocity.x)+Math.abs(this.body.velocity.y);Math.random()<.3&&this.updateParticleTrail(i,s),this.applyRainbowGlow(),this.y<50&&(!this.isDead&&!this.hasJesterHat?this.die():this.hasJesterHat&&(this.y=50,this.body.setVelocityY(0))),this.y>this.scene.scale.height+100&&(this.isDead||this.die())}}class D extends d.GameObjects.Image{constructor(e,t,s,i,o,a,r="normal"){const l=`${i}_pipe_${o}`;super(e,t,s,l);n(this,"pipeType");n(this,"orientation");n(this,"pipeColor");n(this,"scored",!1);n(this,"gapTopY",0);n(this,"gapBottomY",0);n(this,"colorCycleTween");this.pipeType=i,this.orientation=o,this.pipeColor=r,this.applyColorTint(r),o==="top"?this.setOrigin(.5,1):this.setOrigin(.5,0),e.add.existing(this),e.physics.add.existing(this),this.body.setAllowGravity(!1),b(this,{x:this.originX,y:this.originY},80,a,1,1)}setVelocity(e,t=0){return this.body&&this.body.setVelocity(e,t),this}stop(){this.body&&this.body.setVelocity(0,0)}applyColorTint(e){switch(e){case"red":this.setTint(16729156);break;case"blue":this.setTint(4474111);break;case"green":this.setTint(5294200);break;case"yellow":this.setTint(16766720);break;case"purple":this.setTint(7885225);break;case"normal":default:this.clearTint();break}this.pipeColor=e}startColorCycling(e){const t=["green","yellow","purple"];let s=0;this.applyColorTint(t[s]),this.colorCycleTween=e.tweens.addCounter({from:0,to:t.length,duration:600,repeat:-1,onUpdate:i=>{if(this.active){const o=Math.floor(i.getValue())%t.length;o!==s&&(s=o,this.applyColorTint(t[s]))}}})}stopColorCycling(e){this.colorCycleTween&&(this.colorCycleTween.remove(),this.colorCycleTween=void 0),e&&this.applyColorTint(e)}destroy(e){this.colorCycleTween&&this.colorCycleTween.remove(),super.destroy(e)}}class H extends d.Physics.Arcade.Sprite{constructor(e,t,s,i){super(e,t,s,"bee_fly_frame1");n(this,"bobSpeed");n(this,"bobAmplitude");n(this,"initialY");n(this,"bobOffset");e.add.existing(this),e.physics.add.existing(this),b(this,{x:.422,y:1},void 0,50,.8,.8),this.body.setAllowGravity(!1),this.body.setVelocityX(-i),this.initialY=s,this.bobSpeed=d.Math.FloatBetween(2,4),this.bobAmplitude=d.Math.FloatBetween(30,60),this.bobOffset=d.Math.FloatBetween(0,Math.PI*2),this.play("bee_fly_anim"),O(this)}update(e,t){if(!this.active)return;const s=Math.sin(e/1e3*this.bobSpeed+this.bobOffset)*this.bobAmplitude;this.y=this.initialY+s,this.x<-100&&this.destroy()}setScrollSpeed(e){this.body&&this.body.setVelocityX(-e)}stopMovement(){this.body&&this.body.setVelocity(0,0)}}class W extends d.Scene{constructor(){super({key:"GameScene"});n(this,"bear");n(this,"tubes");n(this,"coins");n(this,"enemies");n(this,"powerUps");n(this,"backgrounds");n(this,"tubeSpawnTimer");n(this,"tubeSpawnInterval");n(this,"currentScrollSpeed");n(this,"baseScrollSpeed");n(this,"currentGapSize");n(this,"isJesterHatActive");n(this,"score");n(this,"coinsCollected");n(this,"goldenBearsCollected");n(this,"xrpTokenPoints");n(this,"goldenBearTokenPoints");n(this,"pipePoints");n(this,"consecutiveCoins");n(this,"tubesPassedCount");n(this,"bestScore");n(this,"totalLifetimeCoins");n(this,"difficultyLevel");n(this,"consecutiveTubesPassed");n(this,"lastMilestoneScore");n(this,"previousScore");n(this,"perfectPassCount");n(this,"achievementsUnlocked");n(this,"bgMusic");n(this,"coinSound");n(this,"comboSound");n(this,"tubeHitSound");n(this,"pipePassSound");n(this,"spaceKey");n(this,"gameStarted");n(this,"gameOver");n(this,"gameStartTime");n(this,"lastSpeedIncreaseTime")}init(e={}){console.log("🎮 GameScene init - AGGRESSIVE CHECK before showing any animations");const t=localStorage.getItem("flappyBearSpeedMultiplier"),s=localStorage.getItem("flappyBearAccumulatedScore");let i,o;t&&s?(i=parseFloat(t),o=parseInt(s),console.log(`🚀 INIT: Using boss bonuses from localStorage - ${i}x speed`),i>1&&this.time.delayedCall(1e3,()=>{const a=this.add.text(this.scale.width/2,this.scale.height*.3,`${i}X SPEED!`,{fontFamily:"SupercellMagic",fontSize:"48px",color:"#FF6600",stroke:"#000000",strokeThickness:4,align:"center"});a.setOrigin(.5,.5),a.setDepth(2e3),a.setScrollFactor(0),this.tweens.add({targets:a,scale:{from:.5,to:1.5},alpha:{from:1,to:0},duration:2e3,ease:"Power2",onComplete:()=>a.destroy()})})):(i=1,o=0,console.log("🔄 INIT: Boss bonuses cleared - NO ANIMATION, fresh 1.0x speed start")),this.initialSpeedMultiplier=i,this.initialAccumulatedScore=o}create(){this.gameStarted=!1,this.gameOver=!1,this.score=0,this.coinsCollected=0,this.goldenBearsCollected=0,this.xrpTokenPoints=0,this.goldenBearTokenPoints=0,this.pipePoints=0,this.consecutiveCoins=0,this.tubesPassedCount=0,this.difficultyLevel=0,this.isJesterHatActive=!1,this.consecutiveTubesPassed=0,this.lastMilestoneScore=0,this.previousScore=0,this.perfectPassCount=0;const e=localStorage.getItem("flappyBearAchievements");this.achievementsUnlocked=e?new Set(JSON.parse(e)):new Set,this.bestScore=parseInt(localStorage.getItem("flappyBearBestScore")||"0"),this.totalLifetimeCoins=parseInt(localStorage.getItem("flappyBearTotalCoins")||"0");const t=localStorage.getItem("flappyBearSpeedMultiplier"),s=localStorage.getItem("flappyBearAccumulatedScore");let i,o;t&&s?(i=parseFloat(t),o=parseInt(s),console.log("🚀 USING BOSS VICTORY BONUSES from localStorage")):(i=1,o=0,this.initialSpeedMultiplier=1,this.initialAccumulatedScore=0,console.log("🔄 AGGRESSIVE RESET: Boss bonuses cleared, starting fresh")),this.baseScrollSpeed=f.tubeScrollSpeed.value*i,this.currentScrollSpeed=this.baseScrollSpeed,this.currentGapSize=f.tubeGapSize.value,this.tubeSpawnInterval=f.tubeSpawnInterval.value/i,this.score=o,console.log(`🎮 GameScene create - Speed: ${i}x (${this.currentScrollSpeed}px/s), Score: ${this.score}, Gap: ${this.currentGapSize}`),this.createBackground(),this.bear=new z(this,200,this.scale.height/2),this.bear.body.setGravityY(0),this.tubes=this.add.group(),this.coins=this.add.group(),this.enemies=this.add.group(),this.powerUps=this.add.group(),this.setupInput(),this.setupCollisions(),this.initializeSounds(),this.events.on("bearDied",this.handleGameOver,this),this.scene.launch("UIScene",{gameSceneKey:this.scene.key})}static aggressiveClearBossBonuses(){console.log("💥 AGGRESSIVE CLEAR: Forcing boss bonus reset everywhere"),localStorage.removeItem("flappyBearSpeedMultiplier"),localStorage.removeItem("flappyBearAccumulatedScore"),sessionStorage.removeItem("flappyBearSpeedMultiplier"),sessionStorage.removeItem("flappyBearAccumulatedScore"),console.log("✅ AGGRESSIVE CLEAR: All boss bonuses eliminated")}createBackground(){this.backgrounds=[];const e=this.add.tileSprite(0,0,this.scale.width,this.scale.height,"pixel_castle_background");e.setOrigin(0,0),e.setScrollFactor(0),e.setDepth(-10),this.backgrounds.push(e)}setupInput(){var s,i,o;this.spaceKey=(s=this.input.keyboard)==null?void 0:s.addKey(d.Input.Keyboard.KeyCodes.SPACE);const e=(i=this.input.keyboard)==null?void 0:i.addKey(d.Input.Keyboard.KeyCodes.ESC),t=(o=this.input.keyboard)==null?void 0:o.addKey(d.Input.Keyboard.KeyCodes.P);e&&e.on("down",()=>{this.gameStarted&&!this.gameOver&&this.pauseGame()}),t&&t.on("down",()=>{this.gameStarted&&!this.gameOver&&this.pauseGame()}),this.input.on("pointerdown",()=>{this.handleFlapInput()})}handleFlapInput(){this.gameOver||(this.gameStarted||this.startGame(),this.bear.flap())}startGame(){this.gameStarted=!0,this.bear.body.setGravityY(this.bear.gravity),this.gameStartTime=this.time.now,this.lastSpeedIncreaseTime=this.time.now,this.scheduleNextTubeSpawn()}scheduleNextTubeSpawn(){const e=f.tubeSpawnVariance.value,t=this.tubeSpawnInterval+d.Math.Between(-e/2,e/2);this.tubeSpawnTimer=this.time.delayedCall(t,()=>{this.spawnTubePair(),this.scheduleNextTubeSpawn()})}setupCollisions(){k(this,this.bear,this.tubes,this.handleTubeCollision,void 0,this),k(this,this.bear,this.coins,this.handleCoinCollection,void 0,this),k(this,this.bear,this.enemies,this.handleEnemyCollision,void 0,this),k(this,this.bear,this.powerUps,this.handlePowerUpCollection,void 0,this)}initializeSounds(){const e=C.getInstance();e.init(this),e.play();const t=parseFloat(localStorage.getItem("flappyBearSFXVolume")||"0.3");this.coinSound=this.sound.add("xrp_coin_pickup",{volume:t}),this.comboSound=this.sound.add("combo_pickup",{volume:t}),this.tubeHitSound=this.sound.add("tube_hit",{volume:t}),this.pipePassSound=this.sound.add("pipe_pass_success",{volume:t*.83}),localStorage.getItem("flappyBearAllSoundsMuted")==="true"&&(this.sound.mute=!0,e.setMuted(!0))}updateSoundVolumes(e){this.coinSound&&(this.coinSound.volume=e),this.comboSound&&(this.comboSound.volume=e),this.tubeHitSound&&(this.tubeHitSound.volume=e),this.pipePassSound&&(this.pipePassSound.volume=e*.83)}isUISceneActive(e){const t=this.scene.get(e);return t&&t.scene.isActive()&&t.scene.isVisible()}checkBossTrigger(){const e=this.getCurrentBossTriggerScore();this.score>=e&&!this.gameOver&&this.triggerBossLevel()}getCurrentBossTriggerScore(){const e=te.bossTriggerScore.value;return parseInt(localStorage.getItem("flappyBearBossesDefeated")||"0")===0?e:parseInt(localStorage.getItem("flappyBearLastBossVictoryScore")||"123")+150}triggerBossLevel(){const e=this.getCurrentBossTriggerScore();console.log(`${e} points reached! Triggering boss level!`),this.gameOver=!0,this.tubeSpawnTimer&&this.tubeSpawnTimer.destroy(),this.createBossTransition()}createBossTransition(){this.cameras.main.fadeOut(2e3,0,0,0);const e=parseInt(localStorage.getItem("flappyBearBossesDefeated")||"0"),t=this.getCurrentBossTriggerScore();let s="GARY GENSLER",i="BossLevelScene";e%2===1&&(s="SECOND BOSS",i="SecondBossLevelScene");const o=this.add.text(this.scale.width/2,this.scale.height/2,`${t} POINTS REACHED!
BOSS INCOMING!
${s} APPEARS!`,{fontFamily:"SupercellMagic",fontSize:"42px",color:"#FF0000",stroke:"#000000",strokeThickness:6,align:"center"});o.setOrigin(.5,.5),o.setDepth(3e3),o.setScrollFactor(0),this.tweens.add({targets:o,scale:{from:.5,to:1.2},alpha:{from:0,to:1},duration:1e3,ease:"Back.easeOut"}),this.time.delayedCall(5e3,()=>{this.scene.stop("UIScene"),this.scene.start(i)})}pauseGame(){this.scene.pause(),this.scene.launch("PauseMenuScene",{gameSceneKey:this.scene.key})}spawnTubePair(){const t=this.currentGapSize;let s=this.tubesPassedCount<3?t*1.5:this.tubesPassedCount<6?t*1.25:t;if(this.isJesterHatActive){const x=1.6+this.bear.jesterHatStacks*.2;s=t*x}const i=150,o=this.scale.height-150-s;let a;if(this.isJesterHatActive){const x=this.scale.height/2,S=100;a=x-s/2+d.Math.Between(-S,S),a=d.Math.Clamp(a,i,o)}else a=d.Math.Between(i,o);const r=a+s,l=a+200,h=this.scale.height-r+200,p=this.scale.width+50,m=Math.random()<.5?"bitcoin":"ethereum",g="normal",y=new D(this,p,a,m,"top",l,g);y.setVelocity(-this.currentScrollSpeed,0),y.gapTopY=a,y.gapBottomY=r,this.isJesterHatActive&&y.startColorCycling(this),this.tubes.add(y);const v=new D(this,p,r,m,"bottom",h,g);v.setVelocity(-this.currentScrollSpeed,0),v.gapTopY=a,v.gapBottomY=r,this.isJesterHatActive&&v.startColorCycling(this),this.tubes.add(v);let E=0;if(this.isJesterHatActive?this.bear.jesterHatStacks===1?E=.12:this.bear.jesterHatStacks===2?E=.04:E=0:E=I.jesterHatSpawnChance.value,Math.random()<E){const x=a+s/2;this.spawnJesterHat(p+300,x)}else if(Math.random()<I.magnetSpawnChance.value){const x=a+s/2;this.spawnMagnet(p+250,x)}else Math.random()<f.tokenSpawnChance.value&&this.spawnScatteredCoins(p,a,r,s);const P=Math.min(V.enemySpawnChance.value+this.difficultyLevel*V.enemySpawnIncreasePerLevel.value,V.maxEnemySpawnChance.value);Math.random()<P&&this.spawnEnemyFormation(p+200,a,r,s)}spawnEnemyFormation(e,t,s,i){const o=["single_enemy","horizontal_line","vertical_patrol","v_formation","swarm_cluster"],a=[40-this.difficultyLevel*3,20+this.difficultyLevel*1,15+this.difficultyLevel*1,15+this.difficultyLevel*2,10+this.difficultyLevel*2],r=this.weightedRandomChoice(o,a),l=80;switch(r){case"single_enemy":let h;Math.random()<.5?h=d.Math.Between(100,Math.max(100,t-l)):h=d.Math.Between(Math.min(s+l,this.scale.height-100),this.scale.height-100),this.spawnEnemy(e,h);break;case"horizontal_line":const p=Math.random()<.5?t-l-30:s+l+30;for(let B=0;B<3;B++)this.spawnEnemy(e+B*100,p+B*15);break;case"vertical_patrol":const m=e+50,g=t-l,y=s+l,v=this.spawnEnemy(m,g,"patrol"),E=this.spawnEnemy(m+150,y,"patrol");this.createPatrolMovement(v,g-50,g+50),this.createPatrolMovement(E,y-50,y+50);break;case"v_formation":const P=Math.random()<.5?t-l-40:s+l+40;this.spawnEnemy(e,P),this.spawnEnemy(e+80,P+30),this.spawnEnemy(e+80,P-30);break;case"swarm_cluster":const x=Math.random()<.5?t-l-60:s+l+60,S=4+Math.floor(Math.random()*2),M=[{x:0,y:0},{x:60,y:-20},{x:60,y:20},{x:120,y:0},{x:30,y:-40},{x:30,y:40}];for(let B=0;B<S;B++){const F=M[B];this.spawnEnemy(e+F.x,x+F.y)}break}}weightedRandomChoice(e,t){const s=t.reduce((o,a)=>o+Math.max(0,a),0);let i=Math.random()*s;for(let o=0;o<e.length;o++)if(i-=Math.max(0,t[o]),i<=0)return e[o];return e[0]}createPatrolMovement(e,t,s){!e||!e.active||this.tweens.add({targets:e,y:s,duration:2e3,yoyo:!0,repeat:-1,ease:"Sine.easeInOut"})}spawnEnemy(e,t,s="normal"){const i=new H(this,e,t,this.currentScrollSpeed);return i.behavior=s,this.enemies.add(i),i}spawnJesterHat(e,t){console.log("🎩 Spawning jester hat at",e,t);const s=this.add.image(e,t,"jester_hat_powerup");b(s,{x:.5,y:.5},void 0,60),this.physics.add.existing(s),s.body.setAllowGravity(!1),s.body.setVelocityX(-this.currentScrollSpeed),this.powerUps.add(s),console.log("🎩 Jester hat added to powerUps group. Group size:",this.powerUps.getLength()),this.tweens.add({targets:s,y:t-15,duration:800,yoyo:!0,repeat:-1,ease:"Sine.easeInOut"}),this.tweens.add({targets:s,angle:{from:-10,to:10},duration:1e3,yoyo:!0,repeat:-1,ease:"Sine.easeInOut"})}spawnMagnet(e,t){console.log("🧲 Spawning magnet at",e,t);const s=this.add.circle(e,t,20,65535);s.setStrokeStyle(3,65535),this.physics.add.existing(s),s.body.setAllowGravity(!1),s.body.setVelocityX(-this.currentScrollSpeed),s.powerUpType="magnet",this.powerUps.add(s),this.tweens.add({targets:s,scaleX:1.3,scaleY:1.3,alpha:.5,duration:600,yoyo:!0,repeat:-1,ease:"Sine.easeInOut"})}spawnScatteredCoins(e,t,s,i){const o=["safe_center","risky_edges","trail_pattern","cluster_formation","moving_coins"];switch(o[Math.floor(Math.random()*o.length)]){case"safe_center":this.spawnToken(e,t+i/2);break;case"risky_edges":const r=30,l=Math.random()<.3?2:1;for(let S=0;S<l;S++){const M=S===0?t+r:s-r;this.spawnToken(e+S*100,M,!0)}break;case"trail_pattern":const h=3+Math.floor(Math.random()*2),p=80,m=t+i*.2,g=t+i*.8;for(let S=0;S<h;S++){const M=S/(h-1),B=e+S*p,F=m+(g-m)*M+Math.sin(M*Math.PI*2)*20;this.spawnToken(B,F)}break;case"cluster_formation":const y=t+i/2,v=[{x:0,y:0},{x:-40,y:-25},{x:40,y:-25},{x:-40,y:25},{x:40,y:25}],E=3+Math.floor(Math.random()*2);for(let S=0;S<E;S++){const M=v[S];this.spawnToken(e+M.x,y+M.y)}break;case"moving_coins":const P=t+i/2,x=this.spawnToken(e,P);this.tweens.add({targets:x,y:t+40,duration:1500,yoyo:!0,repeat:-1,ease:"Sine.easeInOut"}),this.tweens.add({targets:x,scale:{from:x.scale*1,to:x.scale*1.2},duration:800,yoyo:!0,repeat:-1,ease:"Sine.easeInOut"});break}}spawnToken(e,t,s=!1){const i=s?f.goldenBearTokenChance.value*2:f.goldenBearTokenChance.value,o=Math.random()<i,a=o?"golden_bear_token":"xrp_token",r=this.add.image(e,t,a);return b(r,{x:.5,y:.5},void 0,50),this.physics.add.existing(r),r.body.setAllowGravity(!1),r.body.setVelocityX(-this.currentScrollSpeed),r.isGoldenBear=o,r.isHighValue=s,this.coins.add(r),this.tweens.add({targets:r,angle:360,duration:s?1500:2e3,repeat:-1,ease:"Linear"}),s&&this.tweens.add({targets:r,alpha:{from:.8,to:1},duration:300,yoyo:!0,repeat:-1,ease:"Sine.easeInOut"}),o&&this.tweens.add({targets:r,scale:{from:r.scale*.95,to:r.scale*1.05},duration:600,yoyo:!0,repeat:-1,ease:"Sine.easeInOut"}),r}handleTubeCollision(e,t){var s;this.gameOver||this.bear.hasJesterHat||(this.handleStreakLoss(),(s=this.tubeHitSound)==null||s.play(),this.screenShake(6,400),this.bear.die(),this.handleGameOver())}handleEnemyCollision(e,t){var s,i;if(!this.gameOver){if(this.bear.hasJesterHat){if(t.destroy(),(s=this.coinSound)==null||s.play(),this.score+=3,this.events.emit("scoreUpdated",this.score),this.checkBossTrigger(),this.gameOver)return;this.createEnemyDefeatedEffect(t.x,t.y);return}this.handleStreakLoss(),(i=this.tubeHitSound)==null||i.play(),this.screenShake(6,400),this.bear.die(),this.handleGameOver(),t.destroy()}}createEnemyDefeatedEffect(e,t){this.createScorePopup(e,t,3,"#FF6B00"),this.createParticleExplosion(e,t,16739072,12,"enemy_defeat"),this.enhancedScreenShake(3,200,"enemy_defeat")}createScorePopup(e,t,s,i,o=!1){const a=typeof s=="string"?s:o?`+${s} x2!`:`+${s}`,r=o||typeof s=="string"?"36px":"28px",l=this.add.text(e,t,a,{fontFamily:"SupercellMagic",fontSize:r,color:i,stroke:"#000000",strokeThickness:4});l.setOrigin(.5,.5),l.setDepth(1e3),this.tweens.add({targets:l,y:t-60,alpha:0,scale:o||typeof s=="string"?1.5:1.2,duration:1200,ease:"Power2",onComplete:()=>l.destroy()})}screenShake(e=2,t=200){this.cameras.main.shake(t,e/1e3)}enhancedScreenShake(e,t,s="default"){const i={default:{intensity:e/1e3,duration:t},enemy_defeat:{intensity:e*.8/1e3,duration:t*.8},coin_collect:{intensity:e*.4/1e3,duration:t*.5},collision:{intensity:e*1.5/1e3,duration:t*1.2},power_up:{intensity:e*.6/1e3,duration:t*.7}},o=i[s]||i.default;this.cameras.main.shake(o.duration,o.intensity)}createParticleExplosion(e,t,s,i=8,o="default"){for(let a=0;a<i;a++){const r=a/i*Math.PI*2,l=100+Math.random()*50,h=3+Math.random()*4,p=this.add.circle(e,t,h,s);p.setDepth(1e3);const m=Math.cos(r)*l,g=Math.sin(r)*l;this.tweens.add({targets:p,x:e+m*.5,y:t+g*.5,alpha:0,scale:o==="coin_collect"?1.5:.5,duration:o==="coin_collect"?800:600,ease:"Power2",onComplete:()=>p.destroy()})}}createCoinSparkleEffect(e,t,s=!1){const i=s?16766720:54527,o=s?16:12;if(this.createParticleExplosion(e,t,i,o,"coin_collect"),s)for(let a=0;a<8;a++){const r=a/8*Math.PI*2,l=25,h=e+Math.cos(r)*l,p=t+Math.sin(r)*l,m=this.add.circle(h,p,2,16777215);m.setDepth(1001),this.tweens.add({targets:m,scale:0,alpha:0,duration:1e3,delay:a*50,ease:"Power2",onComplete:()=>m.destroy()})}}checkAchievement(e,t,s){this.achievementsUnlocked.has(e)||(this.achievementsUnlocked.add(e),localStorage.setItem("flappyBearAchievements",JSON.stringify([...this.achievementsUnlocked])),this.showAchievementToast(t,s),this.sound.play("combo_pickup",{volume:.5}),this.screenShake(3,300))}showAchievementToast(e,t){this.events.emit("achievementUnlocked",{name:e,description:t})}checkScoreMilestones(){const e=[10,25,50,100,150];for(const t of e)this.previousScore<t&&this.score>=t&&(this.createMilestoneEffect(t),this.screenShake(3,250),this.sound.play("combo_pickup",{volume:.5}));this.previousScore=this.score}createMilestoneEffect(e){const t=this.scale.width/2,s=this.scale.height/2,i=this.add.text(t,s,`${e} POINTS!`,{fontFamily:"SupercellMagic",fontSize:"56px",color:"#FFD700",stroke:"#000000",strokeThickness:6});i.setOrigin(.5,.5),i.setDepth(2e3),i.setScrollFactor(0),this.tweens.add({targets:i,scale:{from:.3,to:1.5},alpha:{from:1,to:0},duration:1e3,ease:"Back.easeOut",onComplete:()=>i.destroy()})}createStackMaxEffect(){const e=this.scale.width/2,t=this.scale.height/3,s=this.add.text(e,t,`MAX STACK!
SUPER SPEED!`,{fontFamily:"SupercellMagic",fontSize:"64px",color:"#FF00FF",stroke:"#000000",strokeThickness:8,align:"center"});s.setOrigin(.5,.5),s.setDepth(2e3),s.setScrollFactor(0),this.tweens.add({targets:s,scale:{from:.5,to:1.3},alpha:{from:1,to:0},duration:1500,ease:"Power2",onComplete:()=>s.destroy()})}checkPipePassing(){this.gameOver||this.tubes.children.entries.forEach(e=>{var t;if(e instanceof D&&!e.scored&&this.bear.x>e.x+10&&(e.scored=!0,e.orientation==="top"))if(this.bear.y>=e.gapTopY&&this.bear.y<=e.gapBottomY){this.consecutiveTubesPassed++,this.tubesPassedCount++;let i=f.pointsPerTube.value;const o=(e.gapTopY+e.gapBottomY)/2,a=Math.abs(this.bear.y-o),l=(e.gapBottomY-e.gapTopY)*.15;let h=!1;if(a<=l){const g=Math.round(i*.5);i+=g,h=!0,this.perfectPassCount++,this.createPerfectPassEffect(this.bear.x,this.bear.y),this.sound.play("combo_pickup",{volume:.35}),this.perfectPassCount>=5&&this.checkAchievement("perfectionist","🎯 Perfectionist","Got 5 perfect passes in one run!"),this.perfectPassCount>=10&&this.checkAchievement("sharpshooter","🏹 Sharpshooter","Got 10 perfect passes in one run!"),this.perfectPassCount>=20&&this.checkAchievement("bullseye_master","🎪 Bullseye Master","Got 20 perfect passes in one run!")}this.score+=i,this.pipePoints+=i;const p=h?"#FFD700":"#FFFFFF";this.createScorePopup(this.bear.x,this.bear.y-40,i,p),this.consecutiveTubesPassed>=10?this.screenShake(6,300):this.consecutiveTubesPassed>=5?this.screenShake(4,200):this.screenShake(1,100),this.checkStreakBonus();const m=Math.min(this.consecutiveTubesPassed*.05,.3);if((t=this.pipePassSound)==null||t.play({detune:m*1200}),this.events.emit("scoreUpdated",this.score),this.events.emit("pipesUpdated",this.tubesPassedCount,this.pipePoints),this.events.emit("streakUpdated",this.consecutiveTubesPassed),this.consecutiveCoins=0,this.checkPassingAchievements(),this.checkBossTrigger(),this.gameOver)return;this.updateDifficulty()}else this.handleStreakLoss(),this.consecutiveCoins=0})}checkStreakBonus(){const e=this.consecutiveTubesPassed;e===5?(this.score+=5,this.createStreakEffect("5 IN A ROW!",5,"#FFD700"),this.sound.play("combo_pickup",{volume:.4}),this.screenShake(2,150)):e===10?(this.score+=15,this.createStreakEffect("10 IN A ROW!",15,"#FF6B00"),this.sound.play("new_high_score",{volume:.4}),this.screenShake(4,250)):e===20&&(this.score+=30,this.createStreakEffect(`20 IN A ROW!
MEGA STREAK!`,30,"#FF00FF"),this.sound.play("new_high_score",{volume:.5}),this.screenShake(6,400),this.cameras.main.zoomTo(1.1,200),this.time.delayedCall(400,()=>{this.cameras.main.zoomTo(1,300)})),this.events.emit("scoreUpdated",this.score),this.checkBossTrigger()}handleStreakLoss(){this.consecutiveTubesPassed>0&&(this.createStreakLostEffect(),this.sound.play("tube_hit",{volume:.3,detune:-800}),this.events.emit("streakLost",this.consecutiveTubesPassed)),this.consecutiveTubesPassed=0,this.events.emit("streakUpdated",this.consecutiveTubesPassed)}createStreakLostEffect(){const e=this.scale.width/2,t=this.scale.height/3,s=this.add.text(e,t,"STREAK LOST!",{fontFamily:"SupercellMagic",fontSize:"42px",color:"#FF4444",stroke:"#000000",strokeThickness:6,align:"center"});s.setOrigin(.5,.5),s.setDepth(2e3),s.setScrollFactor(0),this.tweens.add({targets:s,scale:{from:.8,to:1.2},alpha:{from:1,to:0},duration:1200,ease:"Power2.easeOut",onComplete:()=>s.destroy()}),this.screenShake(4,300)}createStreakEffect(e,t,s){const i=this.scale.width/2,o=this.scale.height/3,a=this.add.text(i,o,e,{fontFamily:"SupercellMagic",fontSize:"48px",color:s,stroke:"#000000",strokeThickness:6,align:"center"});a.setOrigin(.5,.5),a.setDepth(2e3),a.setScrollFactor(0);const r=this.add.text(i,o+60,`+${t} BONUS!`,{fontFamily:"SupercellMagic",fontSize:"36px",color:"#FFFF00",stroke:"#000000",strokeThickness:5});r.setOrigin(.5,.5),r.setDepth(2e3),r.setScrollFactor(0),this.tweens.add({targets:[a,r],scale:{from:.5,to:1.2},alpha:{from:1,to:0},y:"-=50",duration:1500,ease:"Power2",onComplete:()=>{a.destroy(),r.destroy()}})}createPerfectPassEffect(e,t){const s=this.add.text(e,t+50,"PERFECT!",{fontFamily:"SupercellMagic",fontSize:"28px",color:"#FFD700",stroke:"#000000",strokeThickness:4});s.setOrigin(.5,.5),s.setDepth(1500),this.tweens.add({targets:s,y:t+20,alpha:0,scale:1.5,duration:800,ease:"Power2",onComplete:()=>s.destroy()});for(let i=0;i<8;i++){const o=i/8*Math.PI*2,a=30,r=this.add.circle(e+Math.cos(o)*a,t+Math.sin(o)*a,4,16766720);r.setDepth(1500),this.tweens.add({targets:r,x:r.x+Math.cos(o)*40,y:r.y+Math.sin(o)*40,alpha:0,scale:0,duration:600,ease:"Power2",onComplete:()=>r.destroy()})}}checkPassingAchievements(){this.score>=10&&this.checkAchievement("first_flight","🎈 First Flight","Reached score 10!"),this.score>=25&&this.checkAchievement("rising_star","⭐ Rising Star","Reached score 25!"),this.score>=50&&this.checkAchievement("sky_master","🦅 Sky Master","Reached score 50!"),this.score>=100&&this.checkAchievement("legend","👑 Legend","Reached score 100!"),this.score>=200&&this.checkAchievement("immortal","💎 Immortal","Reached score 200!"),this.score>=500&&this.checkAchievement("god_mode","🌟 God Mode","Reached score 500!"),this.tubesPassedCount>=25&&this.checkAchievement("pipe_navigator","🚀 Pipe Navigator","Passed 25 pipes!"),this.tubesPassedCount>=50&&this.checkAchievement("obstacle_master","🏆 Obstacle Master","Passed 50 pipes!"),this.tubesPassedCount>=100&&this.checkAchievement("centurion","💯 Centurion","Passed 100 pipes!"),this.consecutiveTubesPassed>=15&&this.checkAchievement("hot_streak","🔥 Hot Streak","15 pipes in a row!"),this.consecutiveTubesPassed>=30&&this.checkAchievement("unstoppable","⚡ Unstoppable","30 pipes in a row!"),this.isJesterHatActive&&this.tubesPassedCount>=10&&this.checkAchievement("invincible","🎩 Invincible","Passed 10 pipes with jester hat!"),this.bear.jesterHatStacks>=3&&this.checkAchievement("triple_threat","🎪 Triple Threat","Stacked 3 jester hats!")}handlePowerUpCollection(e,t){if(this.gameOver)return;if((t.powerUpType||"jesterHat")==="magnet"){console.log("🧲 Magnet collected!"),this.bear.activateMagnet(I.magnetDuration.value),this.sound.play("combo_pickup",{volume:.4}),this.screenShake(2,200),this.createScorePopup(t.x,t.y,"MAGNET!","#00FFFF"),t.destroy();return}console.log("🎩 Jester hat collected! Current speed BEFORE:",this.currentScrollSpeed),this.bear.activateJesterHat(I.jesterHatDuration.value),this.isJesterHatActive=!0;const i=1.5+this.bear.jesterHatStacks*.5;this.currentScrollSpeed=this.baseScrollSpeed*i;const o=Math.max(.18,.5-this.bear.jesterHatStacks*.15);this.tubeSpawnInterval=f.tubeSpawnInterval.value*o,console.log("🚀 Speed AFTER power-up:",this.currentScrollSpeed,"Base:",this.baseScrollSpeed,"Stack:",this.bear.jesterHatStacks,"Multiplier:",i.toFixed(2)),this.tubeSpawnTimer&&this.tubeSpawnTimer.remove(),this.scheduleNextTubeSpawn(),this.updateAllObjectSpeeds(),console.log("✅ All objects updated to new speed!"),this.startPipeColorCycling(),this.sound.play("combo_pickup",{volume:.4}),this.bear.jesterHatStacks===3&&(this.screenShake(8,500),this.createStackMaxEffect(),this.sound.play("new_high_score",{volume:.6})),this.events.off("jesterHatDeactivated"),this.events.once("jesterHatDeactivated",()=>{this.isJesterHatActive=!1,this.currentScrollSpeed=this.baseScrollSpeed,this.tubeSpawnInterval=f.tubeSpawnInterval.value,this.tubeSpawnTimer&&this.tubeSpawnTimer.remove(),this.scheduleNextTubeSpawn(),this.updateAllObjectSpeeds(),this.stopPipeColorCycling()}),t.destroy()}updateAllObjectSpeeds(){this.tubes.children.entries.forEach(e=>{e.body&&e.body.setVelocityX(-this.currentScrollSpeed)}),this.coins.children.entries.forEach(e=>{e.body&&e.body.setVelocityX(-this.currentScrollSpeed)}),this.enemies.children.entries.forEach(e=>{e instanceof H&&e.body&&e.body.setVelocityX(-this.currentScrollSpeed)}),this.powerUps.children.entries.forEach(e=>{e.body&&e.body.setVelocityX(-this.currentScrollSpeed)})}startPipeColorCycling(){this.tubes.children.entries.forEach(e=>{e instanceof D&&e.startColorCycling(this)})}stopPipeColorCycling(){this.tubes.children.entries.forEach(e=>{e instanceof D&&e.stopColorCycling("normal")})}handleCoinCollection(e,t){var v,E;if(this.gameOver)return;const s=t.isGoldenBear,i=t.isHighValue||!1;let o=s?f.pointsPerGoldenBearToken.value:f.pointsPerXRPToken.value;i&&(o=Math.floor(o*1.5)),this.consecutiveCoins++;let a=1,r="";this.consecutiveCoins>=3&&(a=1+(Math.floor((this.consecutiveCoins-3)/3)+1)*.5,r=`x${a.toFixed(1)}`);const l=Math.floor(o*a);this.createCoinSparkleEffect(t.x,t.y,s),this.enhancedScreenShake(1+Math.min(this.consecutiveCoins*.3,4),120,"coin_collect"),s?(this.goldenBearsCollected++,this.goldenBearTokenPoints+=l,this.goldenBearsCollected>=10&&this.checkAchievement("golden_touch","✨ Golden Touch","Collected 10 Golden Bears!")):(this.coinsCollected++,this.xrpTokenPoints+=l);const h=Math.min(this.consecutiveCoins*.08,.6);this.consecutiveCoins>=3?(v=this.comboSound)==null||v.play({detune:h*1200}):(E=this.coinSound)==null||E.play({detune:h*600}),this.consecutiveCoins>=5&&(this.createEnhancedComboEffect(t.x,t.y,this.consecutiveCoins,a),this.checkAchievement("coin_streak","💰 Coin Streak","Collected 5 coins in a row!")),this.consecutiveCoins>=10&&(this.createMegaComboEffect(t.x,t.y),this.checkAchievement("coin_master","💎 Coin Master","Collected 10 coins in a row!")),this.consecutiveCoins>=15&&this.checkAchievement("coin_legend","👑 Coin Legend","Collected 15 coins in a row!"),this.consecutiveCoins>=20&&this.checkAchievement("coin_deity","⚡ Coin Deity","Collected 20 coins in a row!"),parseInt(localStorage.getItem("flappyBearTotalCoins")||"0")+this.coinsCollected>=100&&this.checkAchievement("crypto_collector","🪙 Crypto Collector","Collected 100 XRP total!"),this.coinsCollected>=50&&this.checkAchievement("token_hunter","💰 Token Hunter","Collected 50 tokens in one run!"),this.goldenBearsCollected>=5&&this.checkAchievement("bear_collector","🐻 Bear Collector","Collected 5 golden bears in one run!"),this.score+=l;const m=this.consecutiveCoins>=3;let g;m?g=`+${l} ${r}`:i?g=`+${l} ★`:g=`+${l}`;const y=m?"#FF6B00":s?"#FFD700":"#00D4FF";this.createScorePopup(t.x,t.y,g,y,m),this.checkScoreMilestones(),this.events.emit("scoreUpdated",this.score),this.events.emit("coinsUpdated",this.coinsCollected,this.goldenBearsCollected,this.xrpTokenPoints,this.goldenBearTokenPoints),this.checkBossTrigger(),!this.gameOver&&t.destroy()}createEnhancedComboEffect(e,t,s,i){let o="COMBO!",a="#FFD700";s>=15?(o="LEGENDARY!",a="#FF00FF"):s>=10?(o="MEGA COMBO!",a="#FF6B00"):s>=7&&(o="SUPER COMBO!",a="#FF8C00");const r=this.add.text(e,t-20,o,{fontFamily:"SupercellMagic",fontSize:"36px",color:a,stroke:"#000000",strokeThickness:4});r.setOrigin(.5,.5),r.setDepth(2e3);const l=this.add.text(e,t+15,`${i.toFixed(1)}x MULTIPLIER`,{fontFamily:"SupercellMagic",fontSize:"24px",color:"#FFFFFF",stroke:"#000000",strokeThickness:3});if(l.setOrigin(.5,.5),l.setDepth(2e3),this.tweens.add({targets:r,y:t-80,alpha:0,scale:1.8,duration:1200,ease:"Power2",onComplete:()=>r.destroy()}),this.tweens.add({targets:l,y:t-45,alpha:0,scale:1.3,duration:1e3,delay:200,ease:"Power2",onComplete:()=>l.destroy()}),s>=10)for(let h=0;h<12;h++){const p=h/12*Math.PI*2,m=40,g=e+Math.cos(p)*m,y=t+Math.sin(p)*m,v=this.add.circle(g,y,3,16777215);v.setDepth(1999),this.tweens.add({targets:v,scale:0,alpha:0,duration:800,delay:h*30,ease:"Power2",onComplete:()=>v.destroy()})}}createMegaComboEffect(e,t){const s=this.add.circle(e,t,5,16739072,.6);s.setDepth(1998),this.tweens.add({targets:s,scaleX:8,scaleY:8,alpha:0,duration:800,ease:"Power2",onComplete:()=>s.destroy()})}createComboEffect(e,t){this.createEnhancedComboEffect(e,t,5,1.5)}createCollectionParticles(e,t,s){for(let o=0;o<12;o++){const a=o/12*Math.PI*2,r=d.Math.Between(80,150),l=Math.cos(a)*r,h=Math.sin(a)*r,p=this.add.circle(e,t,d.Math.Between(3,6),s,.9);p.setDepth(1500),this.tweens.add({targets:p,x:e+l*.5,y:t+h*.5,alpha:0,scale:.2,duration:600,ease:"Power2",onComplete:()=>p.destroy()})}}handleGameOver(){var i;if(this.gameOver)return;this.gameOver=!0,(i=this.tubeSpawnTimer)==null||i.remove(),this.tubes.children.entries.forEach(o=>{o instanceof D?o.stop():o.body&&o.body.setVelocityX(0)}),this.coins.children.entries.forEach(o=>{o.body&&o.body.setVelocityX(0)}),this.enemies.children.entries.forEach(o=>{o instanceof H&&o.stopMovement()}),this.powerUps.children.entries.forEach(o=>{o.body&&o.body.setVelocityX(0)});let e=!1;this.score>this.bestScore&&(e=!0,this.bestScore=this.score,localStorage.setItem("flappyBearBestScore",this.bestScore.toString()),this.sound.play("new_high_score",{volume:.3}),this.screenShake(5,400));const t=parseInt(localStorage.getItem("flappyBearTotalXRP")||"0"),s=parseInt(localStorage.getItem("flappyBearTotalGoldenBears")||"0");localStorage.setItem("flappyBearTotalXRP",(t+this.coinsCollected).toString()),localStorage.setItem("flappyBearTotalGoldenBears",(s+this.goldenBearsCollected).toString()),this.totalLifetimeCoins+=this.coinsCollected+this.goldenBearsCollected,localStorage.setItem("flappyBearTotalCoins",this.totalLifetimeCoins.toString()),this.time.delayedCall(500,()=>{this.sound.play("game_over_sound",{volume:.3})}),this.time.delayedCall(1500,()=>{this.scene.launch("GameOverUIScene",{currentLevelKey:this.scene.key,score:this.score,bestScore:this.bestScore,coinsCollected:this.coinsCollected,isNewHighScore:e})})}update(e,t){this.gameOver||(this.spaceKey&&d.Input.Keyboard.JustDown(this.spaceKey)&&this.handleFlapInput(),this.gameStarted&&(this.bear.update(e,t,this.consecutiveTubesPassed),this.checkNearMiss(),this.bear.hasMagnet&&this.attractCoinsToPlayer(),e-this.lastSpeedIncreaseTime>=f.timeBasedSpeedIncreaseInterval.value&&(this.lastSpeedIncreaseTime=e,this.baseScrollSpeed+=f.timeBasedSpeedIncrease.value,this.isJesterHatActive?this.currentScrollSpeed=this.baseScrollSpeed*I.jesterHatSpeedMultiplier.value:this.currentScrollSpeed=this.baseScrollSpeed,this.updateAllObjectSpeeds()),this.backgrounds.forEach((s,i)=>{s.tilePositionX+=this.currentScrollSpeed*t*.001*(.2+i*.3)}),this.checkPipePassing(),this.tubes.children.entries.forEach(s=>{s.x<-100&&s.destroy()}),this.coins.children.entries.forEach(s=>{s.x<-100&&(this.consecutiveCoins=0,s.destroy())}),this.powerUps.children.entries.forEach(s=>{s.x<-100&&s.destroy()}),this.enemies.children.entries.forEach(s=>{s instanceof H&&s.update(e,t)})))}checkNearMiss(){this.gameOver||this.tubes.children.entries.forEach(e=>{if(Math.abs(e.x-this.bear.x)>100||e.nearMissRegistered)return;const t=d.Math.Distance.Between(this.bear.x,this.bear.y,e.x,e.y);if(t<X.nearMissDistance.value&&t>0){e.nearMissRegistered=!0;const s=X.nearMissPoints.value;if(this.score+=s,this.events.emit("scoreUpdated",this.score),this.checkBossTrigger(),this.gameOver)return;this.createScorePopup(this.bear.x,this.bear.y-40,"CLOSE CALL!","#FF6B00"),this.screenShake(4,200),this.sound.play("xrp_coin_pickup",{volume:.2,detune:-400})}})}attractCoinsToPlayer(){const e=I.magnetRadius.value,t=I.magnetAttractionSpeed.value;this.coins.children.entries.forEach(s=>{if(!s.active||!s.body)return;if(d.Math.Distance.Between(this.bear.x,this.bear.y,s.x,s.y)<e){const o=d.Math.Angle.Between(s.x,s.y,this.bear.x,this.bear.y),a=Math.cos(o)*t,r=Math.sin(o)*t;s.body.setVelocity(a,r)}})}updateDifficulty(){const e=Math.floor(this.tubesPassedCount/f.difficultyIncreaseInterval.value);e>this.difficultyLevel&&(this.difficultyLevel=e,this.baseScrollSpeed+=f.speedIncreasePerLevel.value,this.isJesterHatActive?this.currentScrollSpeed=this.baseScrollSpeed*I.jesterHatSpeedMultiplier.value:this.currentScrollSpeed=this.baseScrollSpeed,this.updateAllObjectSpeeds(),this.currentGapSize=Math.max(f.minGapSize.value,this.currentGapSize-f.gapDecreasePerLevel.value),this.tubeSpawnInterval=Math.max(f.minSpawnInterval.value,this.tubeSpawnInterval-f.spawnIntervalDecreasePerLevel.value),this.events.emit("difficultyIncreased",this.difficultyLevel))}}const $=Object.freeze(Object.defineProperty({__proto__:null,default:W},Symbol.toStringTag,{value:"Module"}));class re extends d.Scene{constructor(){super({key:"UIScene"});n(this,"currentGameSceneKey");n(this,"uiContainer");n(this,"currentScore",0);n(this,"currentCoins",0);n(this,"currentGoldenBears",0);n(this,"pipesPassed",0);n(this,"xrpTokenPoints",0);n(this,"goldenBearTokenPoints",0);n(this,"pipePoints",0);n(this,"jesterHatStacks",0);n(this,"powerUpTimerInterval",null);n(this,"powerUpEndTime",0);n(this,"achievementQueue",[]);n(this,"isShowingAchievement",!1);this.currentGameSceneKey=null,this.uiContainer=null}init(e){this.currentGameSceneKey=e.gameSceneKey||null,this.currentScore=0,this.currentCoins=0,this.currentGoldenBears=0,this.pipesPassed=0,this.xrpTokenPoints=0,this.goldenBearTokenPoints=0,this.pipePoints=0,this.jesterHatStacks=0}create(){if(this.createDOMUI(),this.currentGameSceneKey){const e=this.scene.get(this.currentGameSceneKey);e.events.on("scoreUpdated",t=>{this.currentScore=t,this.updateScoreDisplay()}),e.events.on("coinsUpdated",(t,s,i,o)=>{this.currentCoins=t,this.currentGoldenBears=s,this.xrpTokenPoints=i,this.goldenBearTokenPoints=o,this.updateCoinsDisplay()}),e.events.on("pipesUpdated",(t,s)=>{this.pipesPassed=t,this.pipePoints=s,this.updatePipesDisplay()}),e.events.on("jesterHatActivated",t=>{this.jesterHatStacks=t,this.showPowerUpTimer(5e3),this.updateJesterHatStackDisplay()}),e.events.on("jesterHatDeactivated",()=>{this.jesterHatStacks=0,this.hidePowerUpTimer()}),e.events.on("streakUpdated",t=>{this.updateStreakDisplay(t)}),e.events.on("streakLost",t=>{this.handleStreakLost(t)}),e.events.on("achievementUnlocked",t=>{this.showAchievementToast(t.name,t.description)})}}createDOMUI(){const e=`
      <div id="game-ui-container" class="fixed top-0 left-0 w-full h-full pointer-events-none z-[1000] font-supercell">
        <!-- Top HUD -->
        <div class="flex justify-between items-start px-4 pb-8 pt-1 gap-2">
          <!-- Left Side - Token Stats -->
          <div class="flex flex-col gap-1">
            <!-- XRP Tokens -->
            <div class="game-3d-container-[#6B46C1] px-3 py-1 flex items-center gap-2" style="min-width: 160px;">
              <div class="text-white font-bold" style="font-size: 18px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
                XRP:
              </div>
              <div id="xrp-count-display" class="text-yellow-300 font-bold" style="font-size: 18px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
                0
              </div>
              <div class="text-gray-300 font-bold" style="font-size: 14px; text-shadow: 1px 1px 0px rgba(0,0,0,0.5);">
                (<span id="xrp-points-display">0</span>pts)
              </div>
            </div>

            <!-- Golden Bear Tokens -->
            <div class="game-3d-container-[#FFD700] px-3 py-1 flex items-center gap-2" style="min-width: 160px;">
              <div class="text-amber-900 font-bold" style="font-size: 18px; text-shadow: 1px 1px 0px rgba(255,255,255,0.3);">
                🐻:
              </div>
              <div id="golden-count-display" class="text-amber-900 font-bold" style="font-size: 18px; text-shadow: 1px 1px 0px rgba(255,255,255,0.3);">
                0
              </div>
              <div class="text-amber-800 font-bold" style="font-size: 14px; text-shadow: 1px 1px 0px rgba(255,255,255,0.2);">
                (<span id="golden-points-display">0</span>pts)
              </div>
            </div>

            <!-- Pipes Passed -->
            <div class="game-3d-container-[#4A5568] px-3 py-1 flex items-center gap-2" style="min-width: 160px;">
              <div class="text-orange-300 font-bold" style="font-size: 18px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
                ⚡:
              </div>
              <div id="pipes-count-display" class="text-white font-bold" style="font-size: 18px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
                0
              </div>
              <div class="text-gray-300 font-bold" style="font-size: 14px; text-shadow: 1px 1px 0px rgba(0,0,0,0.5);">
                (<span id="pipes-points-display">0</span>pts)
              </div>
            </div>
          </div>
          
          <!-- Center - Score Display -->
          <div class="flex-1 flex justify-center">
            <div class="game-3d-container-[#2C3E50] px-6 py-2" style="min-width: 140px;">
              <div id="score-display" class="text-white text-center font-bold" style="font-size: 40px; text-shadow: 3px 3px 0px rgba(0,0,0,0.5);">
                0
              </div>
            </div>
          </div>

          <!-- Right Side - Pause & Mute Buttons -->
          <div class="flex justify-end gap-2" style="width: 140px;">
            <button id="pause-button" class="game-3d-container-clickable-[#F39C12] px-4 py-2 pointer-events-auto cursor-pointer hover:scale-110 transition-transform" style="min-width: 60px;">
              <div class="text-white font-bold text-center" style="font-size: 28px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
                ⏸️
              </div>
            </button>
            <button id="mute-button" class="game-3d-container-clickable-[#2C3E50] px-4 py-2 pointer-events-auto cursor-pointer hover:scale-110 transition-transform" style="min-width: 60px;">
              <div class="text-white font-bold text-center" style="font-size: 28px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
                <span id="mute-icon">🔊</span>
              </div>
            </button>
          </div>
        </div>
        
        <!-- Tap to Start Instruction (shown before game starts) -->
        <div id="start-instruction" class="absolute bottom-32 left-1/2 -translate-x-1/2 text-white font-bold text-center" style="
          font-size: 36px;
          text-shadow: 3px 3px 0px #000000;
          animation: instructionBlink 1s ease-in-out infinite alternate;
        ">
          TAP TO START
        </div>
        
        <!-- Power-Up Timer (Jester Hat) - Positioned to the left -->
        <div id="powerup-timer-container" class="absolute top-48 left-1/3 -translate-x-1/2 hidden" style="z-index: 1001;">
          <div class="game-3d-container-[#FF6B00] px-6 py-2 flex items-center gap-3">
            <div class="text-white font-bold text-center" style="font-size: 16px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
              🎪 INVINCIBLE
            </div>
            <div id="jester-stack-indicator" class="game-3d-container-clickable-[#FFD700] px-2 py-1 hidden">
              <div class="text-amber-900 font-bold" style="font-size: 14px; text-shadow: 1px 1px 0px rgba(255,255,255,0.3);">
                x<span id="jester-stack-count">1</span>
              </div>
            </div>
            <div class="text-yellow-300 font-bold" style="font-size: 20px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
              <span id="powerup-timer-seconds">5.0</span>s
            </div>
          </div>
        </div>
        
        <!-- Streak Counter -->
        <div id="streak-counter" class="absolute top-64 left-1/2 -translate-x-1/2 hidden" style="z-index: 1000;">
          <div class="game-3d-container-[#3498DB] px-6 py-3">
            <div class="text-white font-bold text-center" style="font-size: 20px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
              🔥 STREAK: <span id="streak-count">0</span>
            </div>
          </div>
        </div>
        
        <!-- Achievement Toast Container -->
        <div id="achievement-toast-container" class="absolute top-24 left-1/2 -translate-x-1/2" style="z-index: 2000;">
        </div>
        
        <!-- Mobile Missile Button (for boss fights) -->
        <div id="mobile-missile-button" class="absolute bottom-6 right-6 pointer-events-auto hidden">
          <button id="missile-action-button" class="game-3d-container-clickable-[#FF6B00] p-4 rounded-full hover:scale-110 transition-transform" style="width: 100px; height: 100px;">
            <img src="https://cdn-game-mcp.gambo.ai/375765b5-6398-4858-8581-3d0fdff4c7b5/images/mobile_missile_button.png" 
                 alt="Missile" 
                 class="w-full h-full object-contain pointer-events-none" />
          </button>
        </div>
      </div>
      
      <style>
        @keyframes instructionBlink {
          from { opacity: 0.4; }
          to { opacity: 1; }
        }
        
        @keyframes powerUpPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        @keyframes achievementSlideIn {
          from {
            transform: translateY(-100px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        @keyframes achievementSlideOut {
          from {
            transform: translateY(0);
            opacity: 1;
          }
          to {
            transform: translateY(-100px);
            opacity: 0;
          }
        }
        
        #powerup-timer-container {
          animation: powerUpPulse 0.5s ease-in-out infinite;
        }
        
        @keyframes streakWiggle {
          0%, 100% { transform: translateX(0); }
          10% { transform: translateX(-10px); }
          20% { transform: translateX(10px); }
          30% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          50% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          70% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
          90% { transform: translateX(-2px); }
        }
      </style>
    `;if(this.uiContainer=U(this,e),this.setupMuteButton(),this.setupPauseButton(),this.currentGameSceneKey){const t=this.scene.get(this.currentGameSceneKey);this.time.addEvent({delay:100,callback:()=>{t.gameStarted&&this.hideStartInstruction()},repeat:50})}}setupMuteButton(){if(!this.uiContainer||!this.uiContainer.node)return;const e=this.uiContainer.node.querySelector("#mute-button"),t=this.uiContainer.node.querySelector("#mute-icon");if(e&&t){const s=localStorage.getItem("flappyBearAllSoundsMuted")==="true";t.textContent=s?"🔇":"🔊",s&&(this.sound.mute=!0,C.getInstance().setMuted(!0)),e.addEventListener("click",()=>{const i=!this.sound.mute;this.sound.mute=i,C.getInstance().setMuted(i),t.textContent=i?"🔇":"🔊",localStorage.setItem("flappyBearAllSoundsMuted",i.toString()),i||this.sound.play("ui_click",{volume:.3})})}}setupPauseButton(){if(!this.uiContainer||!this.uiContainer.node)return;const e=this.uiContainer.node.querySelector("#pause-button");e&&e.addEventListener("click",()=>{if(this.sound.mute||this.sound.play("ui_click",{volume:.3}),this.currentGameSceneKey){const t=this.scene.get(this.currentGameSceneKey);t&&t.gameStarted&&!t.gameOver&&(this.scene.pause(this.currentGameSceneKey),this.scene.launch("PauseMenuScene",{gameSceneKey:this.currentGameSceneKey}))}})}hideStartInstruction(){if(this.uiContainer&&this.uiContainer.node){const e=this.uiContainer.node.querySelector("#start-instruction");e&&(e.style.display="none")}}updateScoreDisplay(){if(this.uiContainer&&this.uiContainer.node){const e=this.uiContainer.node.querySelector("#score-display");e&&(e.textContent=this.currentScore.toString())}}updateCoinsDisplay(){if(this.uiContainer&&this.uiContainer.node){const e=this.uiContainer.node.querySelector("#xrp-count-display");e&&(e.textContent=this.currentCoins.toString());const t=this.uiContainer.node.querySelector("#xrp-points-display");t&&(t.textContent=this.xrpTokenPoints.toFixed(1));const s=this.uiContainer.node.querySelector("#golden-count-display");s&&(s.textContent=this.currentGoldenBears.toString());const i=this.uiContainer.node.querySelector("#golden-points-display");i&&(i.textContent=this.goldenBearTokenPoints.toFixed(1))}}updateJesterHatStackDisplay(){if(!this.uiContainer||!this.uiContainer.node)return;const e=this.uiContainer.node.querySelector("#jester-stack-indicator"),t=this.uiContainer.node.querySelector("#jester-stack-count");e&&t&&(this.jesterHatStacks>1?(e.classList.remove("hidden"),t.textContent=this.jesterHatStacks.toString()):e.classList.add("hidden"))}updatePipesDisplay(){if(this.uiContainer&&this.uiContainer.node){const e=this.uiContainer.node.querySelector("#pipes-count-display");e&&(e.textContent=this.pipesPassed.toString());const t=this.uiContainer.node.querySelector("#pipes-points-display");t&&(t.textContent=this.pipePoints.toFixed(1))}}showPowerUpTimer(e){if(!this.uiContainer||!this.uiContainer.node)return;const t=this.uiContainer.node.querySelector("#powerup-timer-container");t&&(t.classList.remove("hidden"),this.powerUpEndTime=Date.now()+e,this.powerUpTimerInterval&&clearInterval(this.powerUpTimerInterval),this.powerUpTimerInterval=setInterval(()=>{this.updatePowerUpTimer()},100))}updatePowerUpTimer(){if(!this.uiContainer||!this.uiContainer.node)return;const e=Math.max(0,this.powerUpEndTime-Date.now()),t=(e/1e3).toFixed(1),s=this.uiContainer.node.querySelector("#powerup-timer-seconds");s&&(s.textContent=t),e<=0&&this.hidePowerUpTimer()}hidePowerUpTimer(){if(!this.uiContainer||!this.uiContainer.node)return;const e=this.uiContainer.node.querySelector("#powerup-timer-container");e&&e.classList.add("hidden"),this.powerUpTimerInterval&&(clearInterval(this.powerUpTimerInterval),this.powerUpTimerInterval=null)}updateStreakDisplay(e){if(!this.uiContainer||!this.uiContainer.node)return;const t=this.uiContainer.node.querySelector("#streak-counter"),s=this.uiContainer.node.querySelector("#streak-count");!t||!s||(e>=3?(t.classList.remove("hidden"),s.textContent=e.toString()):t.classList.add("hidden"))}handleStreakLost(e){var i,o,a;if(!this.uiContainer||!this.uiContainer.node||e<3)return;[this.uiContainer.node.querySelector("#score-display"),this.uiContainer.node.querySelector("#streak-counter"),(i=this.uiContainer.node.querySelector("#xrp-count-display"))==null?void 0:i.parentElement,(o=this.uiContainer.node.querySelector("#golden-count-display"))==null?void 0:o.parentElement,(a=this.uiContainer.node.querySelector("#pipes-count-display"))==null?void 0:a.parentElement].forEach(r=>{if(r){const l=r;l.style.animation="streakWiggle 0.6s ease-in-out";const h=l.style.color;l.style.color="#FF4444",setTimeout(()=>{l.style.animation="",l.style.color=h},600)}});const s=this.uiContainer.node.querySelector("#streak-counter");s&&!s.classList.contains("hidden")&&(s.style.animation="streakWiggle 0.6s ease-in-out",s.style.backgroundColor="#FF4444",setTimeout(()=>{s.style.animation="",s.style.backgroundColor="",s.classList.add("hidden")},600))}showAchievementToast(e,t){}showNextAchievement(){if(this.achievementQueue.length===0){this.isShowingAchievement=!1;return}if(!this.uiContainer||!this.uiContainer.node)return;const e=this.uiContainer.node.querySelector("#achievement-toast-container");if(!e)return;this.isShowingAchievement=!0;const t=this.achievementQueue.shift();if(!t)return;const s=document.createElement("div");s.className="game-3d-container-[#27AE60] px-8 py-4 mb-3",s.style.minWidth="400px",s.style.animation="achievementSlideIn 0.5s ease-out",s.innerHTML=`
      <div class="flex items-center gap-4">
        <div class="text-4xl">🏆</div>
        <div class="flex-1">
          <div class="text-yellow-300 font-bold" style="font-size: 20px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
            ACHIEVEMENT UNLOCKED!
          </div>
          <div class="text-white font-bold" style="font-size: 18px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
            ${t.name}
          </div>
          <div class="text-gray-200" style="font-size: 14px;">
            ${t.description}
          </div>
        </div>
      </div>
    `,e.appendChild(s),setTimeout(()=>{s.style.animation="achievementSlideOut 0.5s ease-in",setTimeout(()=>{s.remove(),this.showNextAchievement()},500)},3e3)}shutdown(){this.powerUpTimerInterval&&(clearInterval(this.powerUpTimerInterval),this.powerUpTimerInterval=null),this.uiContainer&&(console.log("🧹 Destroying UIScene DOM element"),this.uiContainer.destroy(),this.uiContainer=null)}}const N="https://www.bearpark.xyz/api",j="flappy-bear";class w{static getWalletAddress(){return localStorage.getItem("xaman_wallet_address")}static getDisplayName(){return localStorage.getItem("display_name")||"Anonymous"}static getCurrentUserDisplayName(){const c=localStorage.getItem("display_name");if(c&&c.trim()!=="")return c;const e=localStorage.getItem("twitter_username");if(e&&e.trim()!=="")return e;const t=this.getWalletAddress();return t?this.formatWalletAddress(t):"Anonymous"}static isAuthenticated(){return!!this.getWalletAddress()}static async submitScore(c,e={}){const t=this.getWalletAddress();if(console.log("🔍 [API DEBUG] submitScore called"),console.log("🔍 [API DEBUG] Wallet address:",t),console.log("🔍 [API DEBUG] Score:",c),console.log("🔍 [API DEBUG] Metadata:",e),!t)return console.log("ℹ️ Score not submitted - user not authenticated with XAMAN wallet"),{success:!1,error:"Not authenticated",message:"Connect your XAMAN wallet at bearpark.xyz to save scores!"};try{const s={wallet_address:t,game_id:j,score:c,metadata:{...e,timestamp:new Date().toISOString(),display_name:this.getDisplayName()}};console.log("📤 Submitting score to BEAR Park API..."),console.log("🔍 [API DEBUG] POST URL:",`${N}/leaderboard`),console.log("🔍 [API DEBUG] Payload:",JSON.stringify(s,null,2));const i=await fetch(`${N}/leaderboard`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)});console.log("🔍 [API DEBUG] Response status:",i.status),console.log("🔍 [API DEBUG] Response headers:",Object.fromEntries(i.headers.entries()));const o=await i.json();return console.log("🔍 [API DEBUG] Response data:",o),o.success&&o.is_high_score?console.log("🎉 NEW BEAR PARK HIGH SCORE!",c):o.success?console.log("✅ Score submitted to BEAR Park (not a high score)"):console.log("⚠️ [API DEBUG] Server returned success: false"),o}catch(s){return console.error("❌ [API DEBUG] Error submitting score to BEAR Park:",s),{success:!1,error:s instanceof Error?s.message:"Unknown error"}}}static async getLeaderboard(c=10){var e;try{const t=`${N}/leaderboard/${j}?limit=${c}`;console.log("🔍 [API DEBUG] Fetching leaderboard from:",t);const s=await fetch(t);console.log("🔍 [API DEBUG] Leaderboard response status:",s.status);const i=await s.json();return console.log("🔍 [API DEBUG] Leaderboard response data:",i),console.log("🔍 [API DEBUG] Leaderboard entries:",((e=i.leaderboard)==null?void 0:e.length)||0),i.leaderboard||[]}catch(t){return console.error("❌ [API DEBUG] Error fetching BEAR Park leaderboard:",t),[]}}static async getMyScore(){const c=this.getWalletAddress();if(!c)return null;try{return(await(await fetch(`${N}/leaderboard/${j}/${c}`)).json()).entry||null}catch(e){return console.error("❌ Error fetching user score from BEAR Park:",e),null}}static formatWalletAddress(c){return!c||c.length<8?c:`${c.substring(0,4)}...${c.substring(c.length-4)}`}static formatDisplayName(c){return c.display_name?c.display_name:c.twitter_username?c.twitter_username:c.wallet_address?this.formatWalletAddress(c.wallet_address):"Anonymous"}}class le extends d.Scene{constructor(){super({key:"GameOverUIScene"});n(this,"currentLevelKey");n(this,"isRestarting");n(this,"uiContainer");n(this,"enterKey");n(this,"spaceKey");n(this,"score",0);n(this,"bestScore",0);n(this,"coinsCollected",0);n(this,"isNewHighScore",!1);n(this,"leaderboard",[]);n(this,"playerName","");n(this,"nameSubmitted",!1);this.currentLevelKey=null,this.isRestarting=!1,this.uiContainer=null}init(e){this.currentLevelKey=e.currentLevelKey||"GameScene",this.score=e.score||0,this.bestScore=e.bestScore||0,this.coinsCollected=e.coinsCollected||0,this.isNewHighScore=e.isNewHighScore||!1,this.isRestarting=!1,this.nameSubmitted=!1,this.playerName=""}async create(){if(console.log("🔍 [DEBUG] === GameOverUIScene.create() called ==="),console.log("🔍 [DEBUG] Score:",this.score,"Best:",this.bestScore),console.log("🔍 [DEBUG] Authentication status:",w.isAuthenticated()),console.log("🔍 [DEBUG] Wallet:",w.getWalletAddress()),console.log("🔍 [DEBUG] Display name:",w.getCurrentUserDisplayName()),this.game.canvas&&(this.game.canvas.style.pointerEvents="none",this.game.canvas.style.touchAction="none",console.log("🔍 [DEBUG] Canvas input disabled for Game Over screen")),await this.loadLeaderboard(),console.log("🔍 [DEBUG] Leaderboard loaded, creating UI..."),this.createDOMUI(),console.log("🔍 [DEBUG] DOM UI created"),this.setupInputs(),console.log("🔍 [DEBUG] Inputs setup complete"),w.isAuthenticated()){const e=w.getCurrentUserDisplayName();console.log("🔐 User authenticated as: ${displayName} - auto-submitting score"),this.submitScore(e)}else console.log("ℹ️ [DEBUG] User not authenticated - showing name entry form")}getStarCount(){return this.score>=150?5:this.score>=100?4:this.score>=60?3:this.score>=30?2:this.score>=15?1:0}getStarRatingHTML(){const e=this.getStarCount();let t="";for(let s=0;s<5;s++){const i=s<e,o=i?"⭐":"☆",a=s*.12;t+=`
        <div style="
          font-size: 32px;
          filter: drop-shadow(2px 2px 3px rgba(0,0,0,0.8));
          animation: ${i?"starPop":"none"} 0.5s ease-out ${a}s both;
        ">${o}</div>
      `}return t}createDOMUI(){console.log("🔍 [DEBUG] createDOMUI called"),console.log("🔍 [DEBUG] this.leaderboard before rendering:",this.leaderboard);const e={gold:"#edb723",purple:"#680cd9",yellow:"#feb501",green:"#07ae08",charcoal:"#141619",ink:"#0b0d0e"},t=this.isNewHighScore?`<div style="
           font-size: 28px;
           color: ${e.gold};
           text-shadow: 3px 3px 0px #000000;
           animation: sparkle 0.5s ease-in-out infinite alternate;
           margin-bottom: 20px;
           font-family: 'Luckiest Guy', cursive;
         ">✨ NEW HIGH SCORE! ✨</div>`:"";console.log("🔍 [DEBUG] Generating leaderboard HTML from",this.leaderboard.length,"entries");const s=this.leaderboard.slice(0,5).map((o,a)=>{const r=a===0?"🥇":a===1?"🥈":a===2?"🥉":"",l=a===0?"#FFD700":a===1?"#C0C0C0":a===2?"#CD7F32":e.gold,h=a===0?"4px":a===1||a===2?"3px":"2px",p=a===0?"linear-gradient(135deg, rgba(237, 183, 35, 0.3) 0%, rgba(255, 215, 0, 0.2) 100%)":a===1?"linear-gradient(135deg, rgba(192, 192, 192, 0.2) 0%, rgba(169, 169, 169, 0.15) 100%)":a===2?"linear-gradient(135deg, rgba(205, 127, 50, 0.2) 0%, rgba(184, 115, 51, 0.15) 100%)":"linear-gradient(135deg, rgba(104, 12, 217, 0.15) 0%, rgba(7, 174, 8, 0.15) 100%)",m=o.avatar||"https://files.catbox.moe/25ekkd.png";return`
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          margin-bottom: 6px;
          border-radius: 8px;
          background: ${p};
          border-left: ${h} solid ${l};
          transition: all 0.2s ease;
          font-family: 'Luckiest Guy', cursive;
        " onmouseover="this.style.transform='translateX(4px)'" onmouseout="this.style.transform='translateX(0)'">
          <div style="font-size: 18px; color: ${e.gold}; text-shadow: 1px 1px 0px #000; min-width: 36px;">
            ${r||`#${a+1}`}
          </div>
          <img src="${m}" alt="${o.name}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid ${e.gold}; margin: 0 8px;" onerror="this.src='https://files.catbox.moe/25ekkd.png'">
          <div style="font-size: 16px; color: #fff; text-shadow: 1px 1px 0px #000; flex: 1; margin: 0 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${o.name}
          </div>
          <div style="font-size: 18px; color: ${e.yellow}; text-shadow: 1px 1px 0px #000;">
            ${o.score.toLocaleString()}
          </div>
        </div>
      `}).join("");console.log("🔍 [DEBUG] Generated leaderboard HTML length:",s.length),console.log("🔍 [DEBUG] Leaderboard HTML preview:",s.substring(0,200));const i=`
      <div id="game-over-container" style="
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: linear-gradient(180deg, ${e.charcoal} 0%, ${e.ink} 100%);
        z-index: 2147483647 !important;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Luckiest Guy', cursive;
        pointer-events: auto !important;
        touch-action: auto !important;
      ">
        <div style="
          max-width: 600px;
          width: 100%;
          padding: 16px;
          padding-bottom: calc(16px + env(safe-area-inset-bottom));
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 100vh;
          overflow-y: auto;
        ">

          <!-- Game Over Title -->
          <div style="
            font-size: 40px;
            text-align: center;
            color: #ff3333;
            text-shadow: 3px 3px 0px #000000;
            animation: gameOverPulse 1s ease-in-out infinite alternate;
            font-family: 'Luckiest Guy', cursive;
            line-height: 1;
          ">GAME OVER</div>

          ${t}

          <!-- Star Rating -->
          <div style="display: flex; justify-content: center; gap: 8px; margin: 4px 0;">
            ${this.getStarRatingHTML()}
          </div>

          <!-- Score Card with Tri-Color Border -->
          <div style="
            position: relative;
            background: radial-gradient(500px 200px at 50% -20%, rgba(118,174,255,.12), transparent 60%), ${e.ink};
            border-radius: 16px;
            padding: 16px;
            isolation: isolate;
          ">
            <!-- Tri-color border -->
            <div style="
              content: '';
              position: absolute;
              inset: 0;
              border-radius: 16px;
              padding: 3px;
              background: linear-gradient(135deg, ${e.purple} 0%, ${e.purple} 33.33%, ${e.yellow} 33.33%, ${e.yellow} 66.66%, ${e.green} 66.66%, ${e.green} 100%);
              -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
              -webkit-mask-composite: xor;
              mask-composite: exclude;
              pointer-events: none;
              z-index: 0;
              opacity: 1;
            "></div>

            <div style="position: relative; z-index: 1;">
              <div style="font-size: 16px; color: ${e.gold}; text-shadow: 1px 1px 0px rgba(0,0,0,0.5); margin-bottom: 4px; text-transform: uppercase; text-align: center;">
                YOUR SCORE
              </div>
              <div style="font-size: 36px; color: #fff; text-shadow: 2px 2px 0px rgba(0,0,0,0.5); text-align: center; line-height: 1;">
                ${this.score}
              </div>
              <div style="font-size: 14px; color: #fff; text-align: center; margin-top: 4px;">🪙 ${this.coinsCollected} XRP</div>
            </div>
          </div>

          <!-- Name Entry Form (only shown if NOT authenticated) -->
          ${w.isAuthenticated()?"":`
          <div id="name-entry-container" style="
            background: linear-gradient(180deg, rgba(237,183,35,0.12) 0%, #1a1d22 100%);
            border-radius: 12px;
            padding: 12px;
            border-bottom: 3px solid;
            border-image: linear-gradient(to right, ${e.purple} 0%, ${e.purple} 33.33%, ${e.yellow} 33.33%, ${e.yellow} 66.66%, ${e.green} 66.66%, ${e.green} 100%) 1;
          ">
            <div style="
              font-size: 14px;
              color: ${e.gold};
              text-shadow: 1px 1px 0px #000;
              margin-bottom: 8px;
              text-align: center;
              font-family: 'Luckiest Guy', cursive;
            ">ENTER YOUR NAME</div>

            <input
              id="player-name-input"
              type="text"
              maxlength="12"
              placeholder="Your Name"
              style="
                width: 100%;
                padding: 10px;
                font-size: 18px;
                font-family: 'Luckiest Guy', cursive;
                text-align: center;
                background: rgba(255, 255, 255, 0.9);
                border: 3px solid ${e.gold};
                border-radius: 8px;
                outline: none;
                color: #000;
                margin-bottom: 8px;
                box-sizing: border-box;
                pointer-events: auto;
                touch-action: manipulation;
              "
            />

            <button
              id="submit-name-btn"
              style="
                width: 100%;
                padding: 10px;
                font-size: 18px;
                font-family: 'Luckiest Guy', cursive;
                background: linear-gradient(135deg, ${e.gold} 0%, #d4a617 100%);
                color: #000;
                border: 2px solid rgba(255,255,255,.5);
                border-radius: 8px;
                cursor: pointer;
                box-shadow: 0 3px 12px rgba(237,183,35,.5);
                transition: all 0.2s ease;
                text-shadow: 1px 1px 0px rgba(255,255,255,0.3);
                pointer-events: auto;
                touch-action: manipulation;
              "
              onmouseover="this.style.transform='scale(1.03)'; this.style.boxShadow='0 4px 16px rgba(237,183,35,.7)';"
              onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 3px 12px rgba(237,183,35,.5)';"
              onmousedown="this.style.transform='scale(0.97)';"
              onmouseup="this.style.transform='scale(1.03)';"
              ontouchstart="this.style.transform='scale(0.97)';"
              ontouchend="this.style.transform='scale(1)';"
            >
              SUBMIT SCORE
            </button>

            <div style="
              font-size: 11px;
              color: rgba(255,255,255,0.6);
              text-align: center;
              margin-top: 8px;
              font-family: Arial, sans-serif;
            ">
              Connect your wallet at <a href="https://bearpark.xyz" target="_blank" style="color: ${e.gold}; text-decoration: underline;">bearpark.xyz</a> to save your scores!
            </div>
          </div>
          `}

          <!-- Leaderboard Title -->
          <div style="
            font-size: 20px;
            color: ${e.gold};
            text-shadow: 2px 2px 0px #000;
            text-align: center;
            text-transform: uppercase;
            font-family: 'Luckiest Guy', cursive;
          ">🏆 TOP 5 PLAYERS 🏆</div>

          <!-- Leaderboard -->
          <div style="
            background: radial-gradient(500px 200px at 50% -20%, rgba(118,174,255,.08), transparent 60%), ${e.ink};
            border-radius: 12px;
            padding: 10px;
            max-height: 140px;
            overflow-y: auto;
          ">
            ${s||'<div style="color: #fff; font-size: 14px; text-align: center;">No scores yet!</div>'}
          </div>

          <!-- Retry Button -->
          <button
            id="tap-retry-btn"
            style="
              width: 100%;
              padding: 12px;
              font-size: 24px;
              font-family: 'Luckiest Guy', cursive;
              background: linear-gradient(135deg, #ff3333 0%, #cc0000 100%);
              color: #fff;
              border: 3px solid rgba(255,255,255,.3);
              border-radius: 12px;
              cursor: pointer;
              box-shadow: 0 4px 16px rgba(255,51,51,.5);
              transition: all 0.2s ease;
              text-shadow: 2px 2px 0px #000;
              animation: blink 1s ease-in-out infinite alternate;
              pointer-events: auto;
              touch-action: manipulation;
            "
            onmouseover="this.style.transform='scale(1.03)'; this.style.boxShadow='0 5px 20px rgba(255,51,51,.7)';"
            onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 16px rgba(255,51,51,.5)';"
            onmousedown="this.style.transform='scale(0.97)';"
            onmouseup="this.style.transform='scale(1.03)';"
            ontouchstart="this.style.transform='scale(0.97)';"
            ontouchend="this.style.transform='scale(1)';"
          >
            TAP TO RETRY
          </button>

          <!-- Main Menu Button -->
          <button
            id="main-menu-btn"
            style="
              width: 100%;
              padding: 10px;
              font-size: 18px;
              font-family: 'Luckiest Guy', cursive;
              background: rgba(255,255,255,0.1);
              color: #fff;
              border: 2px solid rgba(255,255,255,.3);
              border-radius: 10px;
              cursor: pointer;
              transition: all 0.2s ease;
              text-shadow: 2px 2px 0px #000;
              pointer-events: auto;
              touch-action: manipulation;
            "
            onmouseover="this.style.background='rgba(255,255,255,0.2)'; this.style.borderColor='${e.gold}';"
            onmouseout="this.style.background='rgba(255,255,255,0.1)'; this.style.borderColor='rgba(255,255,255,.3)';"
            ontouchstart="this.style.background='rgba(255,255,255,0.2)'; this.style.borderColor='${e.gold}';"
            ontouchend="this.style.background='rgba(255,255,255,0.1)'; this.style.borderColor='rgba(255,255,255,.3)';"
          >
            MAIN MENU
          </button>

        </div>

        <!-- Custom Animations -->
        <style>
          @keyframes gameOverPulse {
            from { transform: scale(1); }
            to { transform: scale(1.05); }
          }

          @keyframes blink {
            from { opacity: 0.8; }
            to { opacity: 1; }
          }

          @keyframes sparkle {
            from {
              filter: brightness(1);
              transform: scale(1);
            }
            to {
              filter: brightness(1.3);
              transform: scale(1.05);
            }
          }

          @keyframes starPop {
            0% {
              transform: scale(0) rotate(0deg);
              opacity: 0;
            }
            50% {
              transform: scale(1.3) rotate(180deg);
            }
            100% {
              transform: scale(1) rotate(360deg);
              opacity: 1;
            }
          }

          input:focus {
            border-color: ${e.purple} !important;
            box-shadow: 0 0 0 4px rgba(104, 12, 217, 0.3) !important;
          }

          @media (max-width: 600px) {
            #game-over-container > div:first-child {
              padding-top: 20px;
            }
          }
        </style>
      </div>
    `;this.uiContainer=U(this,i),this.setupNameSubmission()}setupInputs(){var s,i,o,a;this.input.off("pointerdown"),this.enterKey=(s=this.input.keyboard)==null?void 0:s.addKey(d.Input.Keyboard.KeyCodes.ENTER),this.spaceKey=(i=this.input.keyboard)==null?void 0:i.addKey(d.Input.Keyboard.KeyCodes.SPACE);const e=document.getElementById("tap-retry-btn");e&&e.addEventListener("click",r=>{r.preventDefault(),r.stopPropagation(),this.returnToTitle()});const t=document.getElementById("main-menu-btn");t&&t.addEventListener("click",r=>{r.preventDefault(),r.stopPropagation(),this.returnToTitle()}),(o=this.enterKey)==null||o.on("down",()=>{const r=document.getElementById("player-name-input");r&&document.activeElement===r||this.returnToTitle()}),(a=this.spaceKey)==null||a.on("down",()=>{const r=document.getElementById("player-name-input");r&&document.activeElement===r||this.returnToTitle()})}setupNameSubmission(){const e=document.getElementById("submit-name-btn"),t=document.getElementById("player-name-input");e&&t&&(e.addEventListener("click",s=>{s.preventDefault(),s.stopPropagation();const i=t.value.trim();i.length>0&&this.submitScore(i)}),t.addEventListener("keydown",s=>{s.stopPropagation()}),t.addEventListener("keypress",s=>{if(s.stopPropagation(),s.key==="Enter"){s.preventDefault();const i=t.value.trim();i.length>0&&this.submitScore(i)}}),t.addEventListener("keyup",s=>{s.stopPropagation()}))}async loadLeaderboard(){console.log("🔍 [DEBUG] Loading leaderboard from BEAR Park API...");try{const e=await w.getLeaderboard(10);if(console.log("🔍 [DEBUG] Central leaderboard response:",e),console.log("🔍 [DEBUG] Central leaderboard length:",e==null?void 0:e.length),e&&e.length>0)console.log("🔍 [DEBUG] Raw central leaderboard entries:",JSON.stringify(e,null,2)),this.leaderboard=e.map(t=>{var o;const s=w.formatDisplayName(t);console.log("🔍 [DEBUG] Entry:",t,"Display name:",s);let i="https://files.catbox.moe/25ekkd.png";if(t.avatar_nft)try{const a=typeof t.avatar_nft=="string"?JSON.parse(t.avatar_nft):t.avatar_nft;a.imageUrl&&(i=a.imageUrl)}catch(a){console.warn("Failed to parse avatar_nft for",s,a)}return{name:s,score:t.score,coins:((o=t.metadata)==null?void 0:o.coins)||0,date:t.created_at||new Date().toISOString(),avatar:i}}),console.log("✅ Loaded BEAR Park central leaderboard:",this.leaderboard);else{console.log("⚠️ [DEBUG] Central leaderboard is empty, using local fallback");const t=localStorage.getItem("flappyBearLeaderboard");t?(this.leaderboard=JSON.parse(t),console.log("ℹ️ Using local leaderboard as fallback:",this.leaderboard)):(this.leaderboard=[],console.log("⚠️ [DEBUG] No local leaderboard found - leaderboard is empty"))}}catch(e){console.error("❌ [DEBUG] Error loading central leaderboard:",e);const t=localStorage.getItem("flappyBearLeaderboard");t?(this.leaderboard=JSON.parse(t),console.log("ℹ️ Using local leaderboard as fallback after error:",this.leaderboard)):(this.leaderboard=[],console.log("⚠️ [DEBUG] No local leaderboard found after error"))}console.log("🔍 [DEBUG] Final leaderboard state:",this.leaderboard)}async submitScore(e){if(this.nameSubmitted)return;console.log("🔍 [DEBUG] submitScore called with name:",e),console.log("🔍 [DEBUG] Score:",this.score,"Coins:",this.coinsCollected),console.log("🔍 [DEBUG] Is authenticated:",w.isAuthenticated()),console.log("🔍 [DEBUG] Wallet address:",w.getWalletAddress()),this.nameSubmitted=!0,this.playerName=e;const t={name:e,score:this.score,coins:this.coinsCollected,date:new Date().toISOString()},s=localStorage.getItem("flappyBearLeaderboard"),i=s?JSON.parse(s):[];i.push(t),i.sort((a,r)=>r.score-a.score),localStorage.setItem("flappyBearLeaderboard",JSON.stringify(i.slice(0,10))),console.log("🔍 [DEBUG] Saved to local leaderboard:",i.slice(0,10));try{console.log("🔍 [DEBUG] Submitting score to BEAR Park API...");const a=await w.submitScore(this.score,{coins:this.coinsCollected,player_name:e});console.log("🔍 [DEBUG] Submit score result:",a),a.success&&a.is_high_score?console.log("🎉 New BEAR Park high score!"):a.success?console.log("✅ Score submitted successfully (not a high score)"):console.log("⚠️ [DEBUG] Score submission returned success: false"),console.log("🔍 [DEBUG] Reloading leaderboard after submission..."),await this.loadLeaderboard(),w.isAuthenticated()&&(console.log("🔍 [DEBUG] Recreating UI for authenticated user..."),this.uiContainer&&this.uiContainer.destroy(),this.createDOMUI(),this.setupInputs(),console.log("🔍 [DEBUG] UI recreated successfully"))}catch(a){console.error("❌ [DEBUG] Error submitting to BEAR Park:",a),this.leaderboard.push(t),this.leaderboard.sort((r,l)=>l.score-r.score),this.leaderboard=this.leaderboard.slice(0,10)}w.isAuthenticated()||this.sound.play("ui_click",{volume:.3});const o=document.getElementById("name-entry-container");o&&(o.style.display="none"),w.isAuthenticated()||(this.uiContainer&&this.uiContainer.destroy(),this.createDOMUI(),this.setupInputs())}returnToTitle(){this.isRestarting||(this.isRestarting=!0,this.sound.play("ui_click",{volume:.3}),console.log("💀 PLAYER DIED - AGGRESSIVE BOSS BONUS CLEARING"),K(()=>Promise.resolve().then(()=>$),void 0).then(e=>{e.default.aggressiveClearBossBonuses()}),localStorage.removeItem("flappyBearSpeedMultiplier"),localStorage.removeItem("flappyBearAccumulatedScore"),sessionStorage.removeItem("flappyBearSpeedMultiplier"),sessionStorage.removeItem("flappyBearAccumulatedScore"),console.log("💥 ULTRA AGGRESSIVE CLEAR: All boss bonuses ELIMINATED after death"),this.game.canvas&&(this.game.canvas.style.pointerEvents="auto",this.game.canvas.style.touchAction="auto",console.log("🔍 [DEBUG] Canvas input re-enabled for gameplay")),this.input.off("pointerdown"),this.enterKey&&this.enterKey.off("down"),this.spaceKey&&this.spaceKey.off("down"),this.scene.stop("UIScene"),this.scene.stop(this.currentLevelKey),this.scene.start("TitleScreen"))}update(){}}class ce extends d.Scene{constructor(){super({key:"PauseMenuScene"});n(this,"uiContainer",null);n(this,"currentGameSceneKey",null);n(this,"musicManager");n(this,"musicVolume",.6);n(this,"sfxVolume",.3);this.musicManager=C.getInstance()}init(e){this.currentGameSceneKey=e.gameSceneKey||"GameScene",this.musicVolume=parseFloat(localStorage.getItem("flappyBearMusicVolume")||"0.6"),this.sfxVolume=parseFloat(localStorage.getItem("flappyBearSFXVolume")||"0.3")}create(){const e=this.add.rectangle(0,0,this.scale.width,this.scale.height,0,.7);e.setOrigin(0,0),e.setScrollFactor(0),e.setDepth(999),this.createPauseMenuUI()}createPauseMenuUI(){const e=`
      <div id="pause-menu-container" class="fixed top-0 left-0 w-full h-full flex items-center justify-center pointer-events-none z-[1000] font-supercell">
        <!-- Pause Menu Card -->
        <div class="game-3d-container-[#2C3E50] px-12 py-8 pointer-events-auto" style="min-width: 500px; max-width: 600px;">
          
          <!-- Title -->
          <div class="text-center mb-8">
            <div class="text-white font-bold" style="font-size: 56px; text-shadow: 4px 4px 0px rgba(0,0,0,0.5);">
              PAUSED
            </div>
          </div>

          <!-- Settings Section -->
          <div class="mb-8">
            <!-- Music Volume -->
            <div class="mb-6">
              <div class="text-white font-bold mb-3" style="font-size: 24px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
                🎵 Music Volume
              </div>
              <div class="flex items-center gap-4">
                <input 
                  type="range" 
                  id="music-volume-slider" 
                  min="0" 
                  max="100" 
                  value="${Math.round(this.musicVolume*100)}"
                  class="flex-1 h-3 rounded-full cursor-pointer appearance-none bg-gray-700"
                  style="accent-color: #3498DB;"
                />
                <div id="music-volume-display" class="text-white font-bold" style="font-size: 20px; min-width: 50px; text-align: right;">
                  ${Math.round(this.musicVolume*100)}%
                </div>
              </div>
            </div>

            <!-- SFX Volume -->
            <div class="mb-6">
              <div class="text-white font-bold mb-3" style="font-size: 24px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
                🔊 Sound Effects
              </div>
              <div class="flex items-center gap-4">
                <input 
                  type="range" 
                  id="sfx-volume-slider" 
                  min="0" 
                  max="100" 
                  value="${Math.round(this.sfxVolume*100)}"
                  class="flex-1 h-3 rounded-full cursor-pointer appearance-none bg-gray-700"
                  style="accent-color: #E74C3C;"
                />
                <div id="sfx-volume-display" class="text-white font-bold" style="font-size: 20px; min-width: 50px; text-align: right;">
                  ${Math.round(this.sfxVolume*100)}%
                </div>
              </div>
            </div>
          </div>

          <!-- Buttons -->
          <div class="flex flex-col gap-4">
            <!-- Resume Button -->
            <button id="resume-button" class="game-3d-container-clickable-[#27AE60] px-8 py-4 cursor-pointer hover:scale-105 transition-transform">
              <div class="text-white font-bold text-center" style="font-size: 32px; text-shadow: 3px 3px 0px rgba(0,0,0,0.5);">
                ▶ RESUME
              </div>
            </button>

            <!-- Restart Button -->
            <button id="restart-button" class="game-3d-container-clickable-[#F39C12] px-8 py-4 cursor-pointer hover:scale-105 transition-transform">
              <div class="text-white font-bold text-center" style="font-size: 28px; text-shadow: 3px 3px 0px rgba(0,0,0,0.5);">
                🔄 RESTART
              </div>
            </button>

            <!-- Main Menu Button -->
            <button id="main-menu-button" class="game-3d-container-clickable-[#E74C3C] px-8 py-4 cursor-pointer hover:scale-105 transition-transform">
              <div class="text-white font-bold text-center" style="font-size: 28px; text-shadow: 3px 3px 0px rgba(0,0,0,0.5);">
                🏠 MAIN MENU
              </div>
            </button>
          </div>

          <!-- Controls Help -->
          <div class="mt-8 game-3d-container-slot-[#34495E] px-6 py-4">
            <div class="text-gray-300 text-center" style="font-size: 16px;">
              <div class="font-bold text-yellow-300 mb-2">CONTROLS</div>
              <div>SPACE / CLICK - Flap</div>

              <div>ESC / P - Pause</div>
            </div>
          </div>
        </div>
      </div>

      <style>
        /* Custom slider styles */
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }

        input[type="range"]::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
      </style>
    `;this.uiContainer=U(this,e),this.setupButtonHandlers(),this.setupVolumeSliders()}setupButtonHandlers(){if(!this.uiContainer||!this.uiContainer.node)return;const e=this.uiContainer.node.querySelector("#resume-button");e&&e.addEventListener("click",()=>{this.sound.play("ui_click",{volume:this.sfxVolume}),this.resumeGame()});const t=this.uiContainer.node.querySelector("#restart-button");t&&t.addEventListener("click",()=>{this.sound.play("ui_click",{volume:this.sfxVolume}),this.restartGame()});const s=this.uiContainer.node.querySelector("#main-menu-button");s&&s.addEventListener("click",()=>{this.sound.play("ui_click",{volume:this.sfxVolume}),this.goToMainMenu()})}setupVolumeSliders(){if(!this.uiContainer||!this.uiContainer.node)return;const e=this.uiContainer.node.querySelector("#music-volume-slider"),t=this.uiContainer.node.querySelector("#music-volume-display");e&&t&&e.addEventListener("input",o=>{const a=parseInt(o.target.value);this.musicVolume=a/100,t.textContent=`${a}%`,this.musicManager.setVolume(this.musicVolume),localStorage.setItem("flappyBearMusicVolume",this.musicVolume.toString())});const s=this.uiContainer.node.querySelector("#sfx-volume-slider"),i=this.uiContainer.node.querySelector("#sfx-volume-display");s&&i&&s.addEventListener("input",o=>{const a=parseInt(o.target.value);if(this.sfxVolume=a/100,i.textContent=`${a}%`,localStorage.setItem("flappyBearSFXVolume",this.sfxVolume.toString()),this.currentGameSceneKey){const r=this.scene.get(this.currentGameSceneKey);r&&r.updateSoundVolumes&&r.updateSoundVolumes(this.sfxVolume)}this.sound.play("ui_click",{volume:this.sfxVolume})})}resumeGame(){if(console.log("🎮 RESUMING GAME - Current scene:",this.currentGameSceneKey),this.currentGameSceneKey&&(console.log("▶️ Resuming scene:",this.currentGameSceneKey),this.scene.resume(this.currentGameSceneKey),this.currentGameSceneKey.includes("Boss"))){const e=this.scene.get("BossUIScene");e&&!e.scene.isActive()&&(console.log("▶️ Resuming BossUIScene"),this.scene.resume("BossUIScene"))}console.log("❌ Stopping PauseMenuScene"),this.scene.stop(),console.log("✅ Resume complete")}restartGame(){if(console.log("⏸️➡️🔄 PAUSE MENU RESTART - AGGRESSIVE BOSS BONUS CLEARING"),K(()=>Promise.resolve().then(()=>$),void 0).then(e=>{e.default.aggressiveClearBossBonuses()}),localStorage.removeItem("flappyBearSpeedMultiplier"),localStorage.removeItem("flappyBearAccumulatedScore"),sessionStorage.removeItem("flappyBearSpeedMultiplier"),sessionStorage.removeItem("flappyBearAccumulatedScore"),console.log("💥 PAUSE RESTART: All boss bonuses ELIMINATED"),this.currentGameSceneKey){this.scene.stop(this.currentGameSceneKey),this.scene.stop("UIScene");const e=this.scene.get("BossUIScene");e&&e.scene.isActive()&&this.scene.stop("BossUIScene")}this.scene.stop(),this.scene.start("GameScene")}goToMainMenu(){if(console.log("⏸️➡️🏠 PAUSE MENU TO MAIN MENU - AGGRESSIVE BOSS BONUS CLEARING"),K(()=>Promise.resolve().then(()=>$),void 0).then(e=>{e.default.aggressiveClearBossBonuses()}),localStorage.removeItem("flappyBearSpeedMultiplier"),localStorage.removeItem("flappyBearAccumulatedScore"),sessionStorage.removeItem("flappyBearSpeedMultiplier"),sessionStorage.removeItem("flappyBearAccumulatedScore"),console.log("💥 PAUSE TO MENU: All boss bonuses ELIMINATED"),this.currentGameSceneKey){this.scene.stop(this.currentGameSceneKey),this.scene.stop("UIScene");const e=this.scene.get("BossUIScene");e&&e.scene.isActive()&&this.scene.stop("BossUIScene")}this.scene.stop(),this.scene.start("TitleScreen")}shutdown(){this.uiContainer&&(console.log("🧹 Destroying PauseMenuScene DOM element"),this.uiContainer.destroy(),this.uiContainer=null)}}class G extends d.Physics.Arcade.Sprite{constructor(e,t,s,i){super(e,t,s,"red_laser_beam");n(this,"speed",600);n(this,"isActive",!0);e.add.existing(this),e.physics.add.existing(this),b(this,{x:.5,y:.5},void 0,40,.9,.6);const o=new d.Math.Vector2(-1,0);i!==s&&(o.y=(i-s)/Math.abs(i-s)*.3),o.normalize(),this.body.setVelocity(o.x*this.speed,o.y*this.speed),this.setTint(16729156),this.scene.time.delayedCall(4e3,()=>{this.active&&this.destroy()})}update(){(this.x<-100||this.y<-100||this.y>this.scene.scale.height+100)&&this.destroy()}}class he extends d.Physics.Arcade.Sprite{constructor(e,t,s){super(e,t,s,"gary_gensler_phase1");n(this,"maxHealth",300);n(this,"health",300);n(this,"currentPhase",1);n(this,"isInvulnerable",!1);n(this,"isTransitioning",!1);n(this,"moveSpeed",120);n(this,"baseY");n(this,"moveDirection",1);n(this,"moveRange",200);n(this,"lastAttackTime",0);n(this,"attackCooldown",2e3);n(this,"lasersGroup");n(this,"phaseTextures",["gary_gensler_phase1","gary_gensler_phase2","gary_gensler_phase3"]);n(this,"vulnerableZones",{1:new d.Geom.Rectangle(-80,-120,160,240),2:new d.Geom.Rectangle(-100,-20,200,160),3:new d.Geom.Rectangle(-60,-120,120,80)});e.add.existing(this),e.physics.add.existing(this),this.baseY=s,b(this,{x:.5,y:.5},void 0,300,.8,.8),this.body.setImmovable(!0),this.body.setCollideWorldBounds(!0),this.lasersGroup=e.add.group(),this.body.setVelocityY(this.moveSpeed*this.moveDirection),this.setDepth(100)}update(e,t,s){this.isTransitioning||(this.handleMovement(),this.handleAttacks(e,s),this.lasersGroup.children.entries.forEach(i=>{i.update&&i.update()}))}handleMovement(){this.y<=this.baseY-this.moveRange?(this.moveDirection=1,this.body.setVelocityY(this.moveSpeed*this.moveDirection)):this.y>=this.baseY+this.moveRange&&(this.moveDirection=-1,this.body.setVelocityY(this.moveSpeed*this.moveDirection))}handleAttacks(e,t){if(!(e-this.lastAttackTime<this.attackCooldown))switch(this.lastAttackTime=e,this.currentPhase){case 1:this.fireEyeLaser(t);break;case 2:this.fireMouthLaser(t);break;case 3:this.fireThirdEyeLaser(t);break}}fireEyeLaser(e){this.scene.sound.play("laser_fire",{volume:.3});const t=this.x-60,s=this.y-40,i=new G(this.scene,t,s,e);this.lasersGroup.add(i)}fireMouthLaser(e){this.scene.sound.play("laser_fire",{volume:.4});const t=this.x-40,s=this.y+30,i=new G(this.scene,t,s,e);i.setTint(16737792),this.lasersGroup.add(i)}fireThirdEyeLaser(e){this.scene.sound.play("laser_fire",{volume:.4});const t=this.x-20,s=this.y-80;for(let i=0;i<3;i++){const o=e+(i-1)*50,a=new G(this.scene,t,s,o);a.setTint(10027263),this.lasersGroup.add(a)}}takeDamage(e,t,s){if(this.isInvulnerable||this.isTransitioning)return console.log("Boss is invulnerable or transitioning"),!1;console.log(`Phase ${this.currentPhase}: Hit anywhere is valid - same as second boss`),console.log(`Boss position: (${this.x}, ${this.y}), Hit position: (${t}, ${s})`),this.health-=e,this.scene.sound.play("boss_damage",{volume:.4}),this.setTint(16729156),this.scene.time.delayedCall(100,()=>{this.clearTint()}),console.log(`Boss health after damage: ${this.health}/${this.maxHealth}`);let i=this.currentPhase;return this.health<=200&&this.currentPhase===1?i=2:this.health<=100&&this.currentPhase===2&&(i=3),i!==this.currentPhase?(console.log(`Transitioning from Phase ${this.currentPhase} to Phase ${i}`),this.transitionToPhase(i)):this.health<=0&&this.currentPhase===3&&(console.log("Boss defeated - all phases completed"),this.die()),!0}transitionToPhase(e){if(this.isTransitioning)return;this.isTransitioning=!0,this.isInvulnerable=!0,this.currentPhase=e,console.log(`Boss entering Phase ${e}`),this.scene.sound.play("boss_phase_change",{volume:.4}),this.scene.cameras.main.shake(1e3,.02);const t=this.scene.add.text(this.scene.scale.width/2,this.scene.scale.height/3,`PHASE ${e}`,{fontFamily:"SupercellMagic",fontSize:"64px",color:"#FF0000",stroke:"#000000",strokeThickness:8,align:"center"});t.setOrigin(.5,.5),t.setDepth(2e3),t.setScrollFactor(0),this.scene.tweens.add({targets:t,scale:{from:.5,to:1.5},alpha:{from:0,to:1},duration:800,ease:"Back.easeOut",onComplete:()=>{this.scene.tweens.add({targets:t,alpha:0,scale:2,duration:600,delay:400,onComplete:()=>t.destroy()})}}),this.setTexture(this.phaseTextures[e-1]),b(this,{x:.5,y:.5},void 0,300,.8,.8);let s=0;const i=this.scene.time.addEvent({delay:150,repeat:7,callback:()=>{s++,s%2===0?this.setTint(65280):this.clearTint()}});this.scene.time.delayedCall(2500,()=>{this.isTransitioning=!1,this.isInvulnerable=!1,this.clearTint(),i.destroy(),this.currentPhase===2?(this.attackCooldown=1500,this.moveSpeed=150):this.currentPhase===3&&(this.attackCooldown=1e3,this.moveSpeed=180),console.log(`Phase ${e} transition complete - Boss is now vulnerable`)})}die(){this.isInvulnerable=!0,this.body.setVelocity(0,0),this.scene.sound.play("explosion_impact",{volume:.5});const e=this.scene.add.image(this.x,this.y,"explosion_effect");b(e,{x:.5,y:.5},void 0,200),this.scene.tweens.add({targets:this,alpha:0,duration:1e3,ease:"Power2",onComplete:()=>{this.destroy()}}),this.scene.time.delayedCall(1e3,()=>{e.destroy()}),this.scene.events.emit("bossDefeated")}getVulnerableZone(){const e=this.vulnerableZones[this.currentPhase];return new d.Geom.Rectangle(this.x+e.x,this.y+e.y,e.width,e.height)}getHealthPercentage(){return this.health/this.maxHealth*100}getPhaseHealthPercentage(){let e;return this.currentPhase===1?e=Math.max(0,(this.health-200)/100*100):this.currentPhase===2?e=Math.max(0,(this.health-100)/100*100):e=Math.max(0,this.health/100*100),Math.max(0,Math.min(100,e))}}class J extends d.Physics.Arcade.Sprite{constructor(e,t,s){super(e,t,s,"missile_projectile");n(this,"speed",800);n(this,"isActive",!0);e.add.existing(this),e.physics.add.existing(this),b(this,{x:.5,y:.5},void 0,60,.8,.8),this.body.setVelocityX(this.speed),this.scene.time.delayedCall(3e3,()=>{this.active&&this.destroy()})}update(){this.x>this.scene.scale.width+100&&this.destroy()}explode(){if(!this.isActive)return;this.isActive=!1;const e=this.scene.add.image(this.x,this.y,"explosion_effect");b(e,{x:.5,y:.5},void 0,100),this.scene.sound.play("explosion_impact",{volume:.3}),this.scene.time.delayedCall(500,()=>{e.destroy()}),this.destroy()}}class de extends d.Scene{constructor(){super({key:"BossLevelScene"});n(this,"bear");n(this,"boss");n(this,"missiles");n(this,"gameStarted",!1);n(this,"gameOver",!1);n(this,"bossDefeated",!1);n(this,"isTransitioningToGameOver",!1);n(this,"spaceKey");n(this,"missileKey");n(this,"backgrounds",[]);n(this,"lastMissileTime",0);n(this,"missileCooldown",1500);n(this,"musicManager");this.musicManager=C.getInstance()}create(){console.log("🔄 BOSS SCENE CREATE - RESETTING STATE"),this.gameStarted=!1,this.gameOver=!1,this.bossDefeated=!1,this.isTransitioningToGameOver=!1,this.lastMissileTime=0,this.backgrounds=[],this.physics.world.setBounds(0,0,this.scale.width,this.scale.height),this.createBackground(),this.createBear(),this.createBoss(),this.missiles=this.add.group(),this.setupInput(),this.setupCollisions(),this.setupBossEvents(),this.startBossMusic(),this.scene.launch("BossUIScene",{gameSceneKey:this.scene.key}),this.setupPauseResumeHandlers(),console.log("✅ Boss level started! Fight Gary Gensler! Bear health:",this.bear.health,"gameOver:",this.gameOver)}createBackground(){const e=this.add.image(this.scale.width/2,this.scale.height/2,"title_screen_background");e.setOrigin(.5,.5),e.setScrollFactor(0),e.setDepth(-10);const t=this.scale.width/e.width,s=this.scale.height/e.height,i=Math.max(t,s);e.setScale(i),this.backgrounds.push(e)}createBear(){this.bear=new z(this,this.scale.width*.2,this.scale.height*.5),this.bear.body.setGravityY(600),this.bear.body.setCollideWorldBounds(!1),console.log("Bear created with health:",this.bear.health,"maxHealth:",this.bear.maxHealth)}createBoss(){this.boss=new he(this,this.scale.width*.8,this.scale.height*.5)}setupInput(){var e,t;this.spaceKey=(e=this.input.keyboard)==null?void 0:e.addKey(d.Input.Keyboard.KeyCodes.SPACE),this.missileKey=(t=this.input.keyboard)==null?void 0:t.addKey(d.Input.Keyboard.KeyCodes.X),this.input.on("pointerdown",s=>{(s.x<this.scale.width-120||s.y<this.scale.height-120)&&this.handleFlapInput()})}setupCollisions(){k(this,this.bear,this.boss.lasersGroup,this.handleLaserHit,void 0,this),k(this,this.missiles,this.boss,this.handleMissileHit,void 0,this),k(this,this.bear,this.boss,this.handleBossContact,void 0,this)}setupBossEvents(){this.events.on("bossDefeated",()=>{this.handleBossDefeated()}),this.events.on("bearDied",()=>{console.log("BossLevelScene received bearDied event"),this.gameOver?console.log("Game already over, ignoring bearDied event"):(console.log("Setting gameOver = true and calling handleGameOver()"),this.gameOver=!0,this.handleGameOver())})}startBossMusic(){this.musicManager.stop(),this.musicManager.playBossTheme(this)}handleFlapInput(){this.gameOver||(this.gameStarted||this.startGame(),this.bear.flap())}handleMissileInput(){if(this.gameOver||!this.gameStarted)return;const e=this.time.now;if(e-this.lastMissileTime<this.missileCooldown)return;this.lastMissileTime=e;const t=new J(this,this.bear.x+30,this.bear.y);this.missiles.add(t),this.sound.play("missile_launch",{volume:.3})}startGame(){this.gameStarted=!0,console.log("Boss fight started!")}getMissileCooldownProgress(){const e=this.time.now-this.lastMissileTime;return Math.min(e/this.missileCooldown,1)}isMissileReady(){return this.time.now-this.lastMissileTime>=this.missileCooldown}handleLaserHit(e,t){e.isInvulnerable||this.gameOver||(t.destroy(),console.log("Bear hit by laser, health before damage:",e.health),e.takeDamage(1),console.log("Bear health after laser damage:",e.health,"isDead:",e.isDead,"gameOver:",this.gameOver))}handleMissileHit(e,t){if(console.log("Missile hit boss at:",e.x,e.y,"Boss at:",t.x,t.y),e.explode(),t.takeDamage(25,e.x,e.y)){const i=this.add.text(e.x,e.y-30,"HIT!",{fontSize:"28px",color:"#00ff00",fontFamily:"SupercellMagic",stroke:"#000000",strokeThickness:3});this.tweens.add({targets:i,y:i.y-50,alpha:0,scale:1.5,duration:800,onComplete:()=>i.destroy()}),this.cameras.main.shake(200,.01)}else{const i=this.add.text(e.x,e.y-30,"MISS!",{fontSize:"24px",color:"#ff0000",fontFamily:"SupercellMagic",stroke:"#000000",strokeThickness:2});this.tweens.add({targets:i,y:i.y-50,alpha:0,duration:1e3,onComplete:()=>i.destroy()})}}handleBossContact(e,t){e.isInvulnerable||this.gameOver||(e.body.setVelocityX(-200),console.log("Bear contacted boss, health before damage:",e.health),e.takeDamage(1),console.log("Bear health after boss contact damage:",e.health,"isDead:",e.isDead,"gameOver:",this.gameOver))}handleBossDefeated(){this.bossDefeated=!0,this.gameOver=!0,console.log("Boss defeated! Victory!"),this.musicManager.stop(),this.musicManager.play();const e=this.scene.get("GameScene"),t=(e==null?void 0:e.score)||0;e!=null&&e.coinsCollected;const s=parseFloat(localStorage.getItem("flappyBearSpeedMultiplier")||"1.0"),i=250,o=t+i,a=s+.5,r=parseInt(localStorage.getItem("flappyBearBossesDefeated")||"0");localStorage.setItem("flappyBearBossesDefeated",(r+1).toString()),localStorage.setItem("flappyBearLastBossVictoryScore",o.toString()),localStorage.setItem("flappyBearSpeedMultiplier",a.toString()),localStorage.setItem("flappyBearAccumulatedScore",o.toString()),this.scene.stop("BossUIScene"),console.log(`Boss victory! +${i} points, speed now ${a}x`),this.showBossVictoryScreen(t,i,o,a)}showBossVictoryScreen(e,t,s,i){const o=this.add.rectangle(0,0,this.scale.width,this.scale.height,0,.8);o.setOrigin(0,0),o.setDepth(5e3),o.setScrollFactor(0);const a=this.add.text(this.scale.width/2,this.scale.height*.2,"BOSS DEFEATED!",{fontFamily:"SupercellMagic",fontSize:"56px",color:"#00FF00",stroke:"#000000",strokeThickness:6,align:"center"});a.setOrigin(.5,.5),a.setDepth(5001),a.setScrollFactor(0);const r=this.add.text(this.scale.width/2,this.scale.height*.45,`PREVIOUS SCORE: ${e}
+${t} BOSS BONUS

NEW SCORE: ${s}`,{fontFamily:"SupercellMagic",fontSize:"32px",color:"#FFFFFF",stroke:"#000000",strokeThickness:4,align:"center"});r.setOrigin(.5,.5),r.setDepth(5001),r.setScrollFactor(0);const l=this.add.text(this.scale.width/2,this.scale.height*.7,`SPEED INCREASED TO ${i}X!`,{fontFamily:"SupercellMagic",fontSize:"28px",color:"#FF6600",stroke:"#000000",strokeThickness:4,align:"center"});l.setOrigin(.5,.5),l.setDepth(5001),l.setScrollFactor(0);const h=this.add.text(this.scale.width/2,this.scale.height*.85,"GAME CONTINUES IN 3 SECONDS...",{fontFamily:"SupercellMagic",fontSize:"20px",color:"#CCCCCC",stroke:"#000000",strokeThickness:3,align:"center"});h.setOrigin(.5,.5),h.setDepth(5001),h.setScrollFactor(0),this.tweens.add({targets:a,scale:{from:.5,to:1.2},alpha:{from:0,to:1},duration:800,ease:"Back.easeOut"}),this.tweens.add({targets:r,alpha:{from:0,to:1},y:{from:r.y+50,to:r.y},duration:1e3,delay:500,ease:"Power2.easeOut"}),this.tweens.add({targets:l,alpha:{from:0,to:1},scale:{from:.8,to:1.1},duration:800,delay:1e3,ease:"Back.easeOut"}),this.time.delayedCall(3e3,()=>{this.scene.start("GameScene",{speedMultiplier:i,accumulatedScore:s})})}handleGameOver(){if(this.isTransitioningToGameOver){console.log("⚠️ Already transitioning to game over, ignoring duplicate call");return}console.log("🎮 GAME OVER - Boss fight failed! Setting transition flag"),this.isTransitioningToGameOver=!0,this.gameOver=!0,this.musicManager.stop(),this.musicManager.play(),console.log("💥 NUCLEAR CLEANUP: Removing all UI overlays"),document.querySelectorAll('[id*="ui-container"], [id*="boss-ui"]').forEach(l=>{console.log("🧹 Removing overlay:",l.id),l.remove()});const t=this.scene.get("BossUIScene");if(t&&t.uiContainer){console.log("🧹 EMERGENCY: Manually destroying BossUIScene DOM");try{t.uiContainer.destroy()}catch{console.log("⚠️ Error destroying container, forcing removal")}t.uiContainer=null}console.log("🛑 STOPPING BossUIScene"),this.scene.isActive("BossUIScene")&&this.scene.stop("BossUIScene"),this.game.canvas&&(this.game.canvas.style.pointerEvents="none",this.game.canvas.style.touchAction="none",console.log("🔒 Canvas input disabled before GameOver")),document.querySelectorAll("canvas").forEach(l=>{l.style.pointerEvents="none",l.style.touchAction="none"});const s=this.scene.get("GameScene"),i=(s==null?void 0:s.score)||0,o=(s==null?void 0:s.coinsCollected)||0,a=parseInt(localStorage.getItem("flappyBearBestScore")||"0"),r=i>a;r&&(localStorage.setItem("flappyBearBestScore",i.toString()),console.log("New high score saved:",i)),console.log("🚀 LAUNCHING GameOverUIScene with score:",i),setTimeout(()=>{this.scene.start("GameOverUIScene",{currentLevelKey:"GameScene",score:i,bestScore:Math.max(i,a),coinsCollected:o,isNewHighScore:r})},100)}update(e,t){if(!this.gameOver){if(this.bear&&(this.bear.health<=0||this.bear.isDead)&&!this.gameOver){console.log("UPDATE LOOP: Bear is dead (health="+this.bear.health+", isDead="+this.bear.isDead+") - FORCING game over"),this.gameOver=!0,this.handleGameOver();return}this.bear&&this.bear.active&&this.bear.update(e,t),this.boss&&this.boss.active&&this.gameStarted&&this.boss.update(e,t,this.bear.y),this.missiles.children.entries.forEach(s=>{s.update&&s.update()}),this.spaceKey&&d.Input.Keyboard.JustDown(this.spaceKey)&&this.handleFlapInput(),this.missileKey&&d.Input.Keyboard.JustDown(this.missileKey)&&this.isMissileReady()&&this.handleMissileInput(),this.bear.y<50&&(this.bear.y=50,this.bear.body.setVelocityY(0)),this.bear.y>this.scale.height+100&&!this.gameOver&&(console.log("Bear fell off screen"),this.gameOver=!0,this.handleGameOver())}}setupPauseResumeHandlers(){console.log("🎮 Setting up pause/resume handlers for boss scene"),this.events.on("pause",()=>{console.log("⏸️ BOSS SCENE PAUSED"),this.tweens.pauseAll(),this.boss&&this.boss.pauseBehavior&&this.boss.pauseBehavior()}),this.events.on("resume",()=>{console.log("▶️ BOSS SCENE RESUMED"),this.tweens.resumeAll(),this.boss&&this.boss.resumeBehavior&&this.boss.resumeBehavior(),this.bear&&!this.bear.isDead&&!this.gameOver&&console.log("✅ Bear state ok after resume - health:",this.bear.health)})}shutdown(){console.log("🧹 BOSS SCENE SHUTDOWN - Cleaning up"),this.musicManager&&this.musicManager.stop(),this.input.removeAllListeners(),this.events.removeAllListeners(),this.gameStarted=!1,this.gameOver=!1,this.bossDefeated=!1,this.isTransitioningToGameOver=!1,this.lastMissileTime=0,console.log("✅ BOSS SCENE CLEANUP COMPLETE")}}class Y extends d.Physics.Arcade.Sprite{constructor(e,t,s,i,o=0){super(e,t,s,"explosion_effect");n(this,"speed",400);n(this,"isActive",!0);e.add.existing(this),e.physics.add.existing(this),b(this,{x:.5,y:.5},void 0,60,.8,.8);const a=new d.Math.Vector2(-1,0);i!==s&&(a.y=(i-s)/Math.abs(i-s)*.4);const r=Math.atan2(a.y,a.x)+o;a.x=Math.cos(r),a.y=Math.sin(r),a.normalize(),this.body.setVelocity(a.x*this.speed,a.y*this.speed),this.setTint(16729088),this.scene.tweens.add({targets:this,rotation:Math.PI*4,duration:2e3,ease:"Linear"}),this.scene.time.delayedCall(5e3,()=>{this.active&&this.destroy()})}update(){(this.x<-100||this.y<-100||this.y>this.scene.scale.height+100)&&this.destroy()}}class ue extends d.Physics.Arcade.Sprite{constructor(e,t,s){super(e,t,s,"gary_gensler_phase1");n(this,"maxHealth",300);n(this,"health",300);n(this,"currentPhase",1);n(this,"isInvulnerable",!1);n(this,"isTransitioning",!1);n(this,"moveSpeed",120);n(this,"baseY");n(this,"moveDirection",1);n(this,"moveRange",200);n(this,"lastAttackTime",0);n(this,"attackCooldown",2e3);n(this,"projectilesGroup");n(this,"phaseTextures",["gary_gensler_phase1","gary_gensler_phase2","gary_gensler_phase3"]);e.add.existing(this),e.physics.add.existing(this),this.baseY=s,b(this,{x:.5,y:.5},void 0,300,.8,.8),this.body.setImmovable(!0),this.body.setCollideWorldBounds(!0),this.projectilesGroup=e.add.group(),this.body.setVelocityY(this.moveSpeed*this.moveDirection),this.setDepth(100)}update(e,t,s){this.isTransitioning||(this.handleMovement(),this.handleAttacks(e,s),this.projectilesGroup.children.entries.forEach(i=>{i.update&&i.update()}))}handleMovement(){this.y<=this.baseY-this.moveRange?(this.moveDirection=1,this.body.setVelocityY(this.moveSpeed*this.moveDirection)):this.y>=this.baseY+this.moveRange&&(this.moveDirection=-1,this.body.setVelocityY(this.moveSpeed*this.moveDirection))}handleAttacks(e,t){if(!(e-this.lastAttackTime<this.attackCooldown))switch(this.lastAttackTime=e,this.currentPhase){case 1:this.fireSingleLaser(t);break;case 2:this.fireTwinFireballs(t);break;case 3:this.fireMultipleAttacks(t);break}}fireSingleLaser(e){this.scene.sound.play("laser_fire",{volume:.3});const t=this.x-60,s=this.y,i=new G(this.scene,t,s,e);this.projectilesGroup.add(i)}fireTwinFireballs(e){this.scene.sound.play("explosion_impact",{volume:.3});const t=this.x-40,s=this.y+20,i=.3,o=new Y(this.scene,t,s,e,-i);this.projectilesGroup.add(o);const a=new Y(this.scene,t,s,e,i);this.projectilesGroup.add(a)}fireMultipleAttacks(e){this.scene.sound.play("laser_fire",{volume:.4});const t=this.x-30,s=this.y;for(let o=0;o<3;o++){const a=e+(o-1)*60,r=new G(this.scene,t,s-20,a);r.setTint(10027263),this.projectilesGroup.add(r)}const i=new Y(this.scene,t,s+40,e,0);this.projectilesGroup.add(i)}takeDamage(e,t,s){if(this.isInvulnerable||this.isTransitioning)return console.log("Second Boss is invulnerable or transitioning"),!1;console.log("Second Boss: Hit anywhere is valid (all phases)"),this.health-=e,this.scene.sound.play("boss_damage",{volume:.4}),this.setTint(16729156),this.scene.time.delayedCall(100,()=>{this.clearTint()}),console.log(`Second Boss health after damage: ${this.health}/${this.maxHealth}`);let i=this.currentPhase;return this.health<=200&&this.currentPhase===1?i=2:this.health<=100&&this.currentPhase===2&&(i=3),i!==this.currentPhase?(console.log(`Second Boss transitioning from Phase ${this.currentPhase} to Phase ${i}`),this.transitionToPhase(i)):this.health<=0&&this.currentPhase===3&&(console.log("Second Boss defeated - all phases completed"),this.die()),!0}transitionToPhase(e){if(this.isTransitioning)return;this.isTransitioning=!0,this.isInvulnerable=!0,this.currentPhase=e,console.log(`Second Boss entering Phase ${e}`),this.scene.sound.play("boss_phase_change",{volume:.4}),this.scene.cameras.main.shake(1e3,.02);const t=this.scene.add.text(this.scene.scale.width/2,this.scene.scale.height/3,`PHASE ${e}`,{fontFamily:"SupercellMagic",fontSize:"64px",color:"#FF0000",stroke:"#000000",strokeThickness:8,align:"center"});t.setOrigin(.5,.5),t.setDepth(2e3),t.setScrollFactor(0),this.scene.tweens.add({targets:t,scale:{from:.5,to:1.5},alpha:{from:0,to:1},duration:800,ease:"Back.easeOut",onComplete:()=>{this.scene.tweens.add({targets:t,alpha:0,scale:2,duration:600,delay:400,onComplete:()=>t.destroy()})}}),this.setTexture(this.phaseTextures[e-1]),b(this,{x:.5,y:.5},void 0,300,.8,.8);let s=0;const i=this.scene.time.addEvent({delay:150,repeat:7,callback:()=>{s++,s%2===0?this.setTint(65280):this.clearTint()}});this.scene.time.delayedCall(2500,()=>{this.isTransitioning=!1,this.isInvulnerable=!1,this.clearTint(),i.destroy(),this.currentPhase===2?(this.attackCooldown=1500,this.moveSpeed=150):this.currentPhase===3&&(this.attackCooldown=1e3,this.moveSpeed=180),console.log(`Second Boss Phase ${e} transition complete - Boss is now vulnerable`)})}die(){this.isInvulnerable=!0,this.body.setVelocity(0,0),this.scene.sound.play("explosion_impact",{volume:.5});const e=this.scene.add.image(this.x,this.y,"explosion_effect");b(e,{x:.5,y:.5},void 0,200),this.scene.tweens.add({targets:this,alpha:0,duration:1e3,ease:"Power2",onComplete:()=>{this.destroy()}}),this.scene.time.delayedCall(1e3,()=>{e.destroy()}),this.scene.events.emit("secondBossDefeated")}getHealthPercentage(){return this.health/this.maxHealth*100}getPhaseHealthPercentage(){let e;return this.currentPhase===1?e=Math.max(0,(this.health-200)/100*100):this.currentPhase===2?e=Math.max(0,(this.health-100)/100*100):e=Math.max(0,this.health/100*100),Math.max(0,Math.min(100,e))}}class pe extends d.Scene{constructor(){super({key:"SecondBossLevelScene"});n(this,"bear");n(this,"boss");n(this,"missiles");n(this,"spaceKey");n(this,"missileKey");n(this,"gameStarted",!1);n(this,"gameOver",!1);n(this,"bossDefeated",!1);n(this,"isTransitioningToGameOver",!1);n(this,"lastMissileTime",0);n(this,"missileCooldown",800);n(this,"musicManager");this.musicManager=C.getInstance()}create(){console.log("🔄 SECOND BOSS SCENE CREATE - RESETTING STATE"),this.gameStarted=!1,this.gameOver=!1,this.bossDefeated=!1,this.isTransitioningToGameOver=!1,this.lastMissileTime=0,console.log("Second Boss Level Scene created"),this.createBackground(),this.createBear(),this.createBoss(),this.createMissiles(),this.setupInput(),this.setupCollisions(),this.setupBossEvents(),this.startBossMusic(),this.scene.launch("BossUIScene",{bossType:"secondBoss",currentLevelKey:this.scene.key}),this.setupPauseResumeHandlers(),console.log("Second Boss Level Scene setup complete")}createBackground(){const e=this.add.image(this.scale.width/2,this.scale.height/2,"title_screen_background");e.setOrigin(.5,.5),e.setScrollFactor(0),e.setDepth(-10);const t=this.scale.width/e.width,s=this.scale.height/e.height,i=Math.max(t,s);e.setScale(i)}createMissiles(){this.missiles=this.add.group()}createBear(){this.bear=new z(this,this.scale.width*.2,this.scale.height*.5),this.bear.body.setGravityY(600),this.bear.body.setCollideWorldBounds(!1)}createBoss(){this.boss=new ue(this,this.scale.width*.8,this.scale.height*.5)}setupInput(){var e,t;this.spaceKey=(e=this.input.keyboard)==null?void 0:e.addKey(d.Input.Keyboard.KeyCodes.SPACE),this.missileKey=(t=this.input.keyboard)==null?void 0:t.addKey(d.Input.Keyboard.KeyCodes.X),this.input.on("pointerdown",s=>{(s.x<this.scale.width-120||s.y<this.scale.height-120)&&this.handleFlapInput()})}setupCollisions(){k(this,this.bear,this.boss.projectilesGroup,this.handleProjectileHit,void 0,this),k(this,this.missiles,this.boss,this.handleMissileHit,void 0,this),k(this,this.bear,this.boss,this.handleBossContact,void 0,this)}setupBossEvents(){this.events.on("secondBossDefeated",()=>{this.handleBossDefeated()}),this.events.on("bearDied",()=>{console.log("SecondBossLevelScene received bearDied event"),this.gameOver?console.log("Game already over, ignoring bearDied event"):(console.log("Setting gameOver = true and calling handleGameOver()"),this.gameOver=!0,this.handleGameOver())})}startBossMusic(){this.musicManager.stop(),this.musicManager.playBossTheme(this)}handleFlapInput(){this.gameOver||(this.gameStarted||this.startGame(),this.bear.flap())}handleMissileInput(){if(this.gameOver||!this.gameStarted)return;const e=this.time.now;if(e-this.lastMissileTime<this.missileCooldown)return;this.lastMissileTime=e;const t=new J(this,this.bear.x+30,this.bear.y);this.missiles.add(t),this.sound.play("missile_launch",{volume:.3})}startGame(){this.gameStarted=!0,console.log("Second Boss fight started!")}getMissileCooldownProgress(){const e=this.time.now-this.lastMissileTime;return Math.min(e/this.missileCooldown,1)}isMissileReady(){return this.time.now-this.lastMissileTime>=this.missileCooldown}handleProjectileHit(e,t){e.isInvulnerable||this.gameOver||(t.destroy(),console.log("Bear hit by projectile, health before damage:",e.health),e.takeDamage(1),console.log("Bear health after projectile damage:",e.health,"isDead:",e.isDead,"gameOver:",this.gameOver))}handleMissileHit(e,t){if(console.log("Missile hit second boss at:",e.x,e.y,"Boss at:",t.x,t.y),e.explode(),t.takeDamage(25,e.x,e.y)){const i=this.add.text(e.x,e.y-30,"HIT!",{fontSize:"28px",color:"#00ff00",fontFamily:"SupercellMagic",stroke:"#000000",strokeThickness:3});this.tweens.add({targets:i,y:i.y-50,alpha:0,scale:1.5,duration:800,onComplete:()=>i.destroy()}),this.cameras.main.shake(200,.01)}else{const i=this.add.text(e.x,e.y-30,"MISS!",{fontSize:"24px",color:"#ff0000",fontFamily:"SupercellMagic",stroke:"#000000",strokeThickness:2});this.tweens.add({targets:i,y:i.y-50,alpha:0,duration:1e3,onComplete:()=>i.destroy()})}}handleBossContact(e,t){e.isInvulnerable||this.gameOver||(e.body.setVelocityX(-200),console.log("Bear contacted second boss, health before damage:",e.health),e.takeDamage(1),console.log("Bear health after second boss contact damage:",e.health,"isDead:",e.isDead,"gameOver:",this.gameOver))}handleBossDefeated(){this.bossDefeated=!0,this.gameOver=!0,console.log("Second Boss defeated! Victory!"),this.musicManager.stop(),this.musicManager.play();const e=this.scene.get("GameScene"),t=(e==null?void 0:e.score)||0;e!=null&&e.coinsCollected;const s=parseFloat(localStorage.getItem("flappyBearSpeedMultiplier")||"1.0"),i=300,o=t+i,a=s+.5,r=parseInt(localStorage.getItem("flappyBearBossesDefeated")||"0");localStorage.setItem("flappyBearBossesDefeated",(r+1).toString()),localStorage.setItem("flappyBearLastBossVictoryScore",o.toString()),localStorage.setItem("flappyBearSpeedMultiplier",a.toString()),localStorage.setItem("flappyBearAccumulatedScore",o.toString()),this.scene.stop("BossUIScene"),console.log(`Second Boss victory! +${i} points, speed now ${a}x`),this.showBossVictoryScreen(t,i,o,a)}showBossVictoryScreen(e,t,s,i){const o=this.add.rectangle(0,0,this.scale.width,this.scale.height,0,.8);o.setOrigin(0,0),o.setDepth(5e3),o.setScrollFactor(0);const a=this.add.text(this.scale.width/2,this.scale.height*.2,"SECOND BOSS DEFEATED!",{fontFamily:"SupercellMagic",fontSize:"48px",color:"#00FF00",stroke:"#000000",strokeThickness:6,align:"center"});a.setOrigin(.5,.5),a.setDepth(5001),a.setScrollFactor(0);const r=this.add.text(this.scale.width/2,this.scale.height*.45,`PREVIOUS SCORE: ${e}
+${t} BOSS BONUS

NEW SCORE: ${s}`,{fontFamily:"SupercellMagic",fontSize:"32px",color:"#FFFFFF",stroke:"#000000",strokeThickness:4,align:"center"});r.setOrigin(.5,.5),r.setDepth(5001),r.setScrollFactor(0);const l=this.add.text(this.scale.width/2,this.scale.height*.7,`SPEED INCREASED TO ${i}X!`,{fontFamily:"SupercellMagic",fontSize:"28px",color:"#FF6600",stroke:"#000000",strokeThickness:4,align:"center"});l.setOrigin(.5,.5),l.setDepth(5001),l.setScrollFactor(0);const h=this.add.text(this.scale.width/2,this.scale.height*.85,"GAME CONTINUES IN 3 SECONDS...",{fontFamily:"SupercellMagic",fontSize:"20px",color:"#CCCCCC",stroke:"#000000",strokeThickness:3,align:"center"});h.setOrigin(.5,.5),h.setDepth(5001),h.setScrollFactor(0),this.tweens.add({targets:a,scale:{from:.5,to:1.2},alpha:{from:0,to:1},duration:800,ease:"Back.easeOut"}),this.tweens.add({targets:r,alpha:{from:0,to:1},y:{from:r.y+50,to:r.y},duration:1e3,delay:500,ease:"Power2.easeOut"}),this.tweens.add({targets:l,alpha:{from:0,to:1},scale:{from:.8,to:1.1},duration:800,delay:1e3,ease:"Back.easeOut"}),this.time.delayedCall(3e3,()=>{this.scene.start("GameScene",{speedMultiplier:i,accumulatedScore:s})})}handleGameOver(){if(this.isTransitioningToGameOver){console.log("⚠️ Already transitioning to game over, ignoring duplicate call");return}console.log("🎮 GAME OVER - Second Boss fight failed! Setting transition flag"),this.isTransitioningToGameOver=!0,this.gameOver=!0,this.musicManager.stop(),this.musicManager.play(),console.log("💥 NUCLEAR CLEANUP: Removing all UI overlays"),document.querySelectorAll('[id*="ui-container"], [id*="boss-ui"]').forEach(l=>{console.log("🧹 Removing overlay:",l.id),l.remove()});const t=this.scene.get("BossUIScene");if(t&&t.uiContainer){console.log("🧹 EMERGENCY: Manually destroying BossUIScene DOM");try{t.uiContainer.destroy()}catch{console.log("⚠️ Error destroying container, forcing removal")}t.uiContainer=null}console.log("🛑 STOPPING BossUIScene"),this.scene.isActive("BossUIScene")&&this.scene.stop("BossUIScene"),this.game.canvas&&(this.game.canvas.style.pointerEvents="none",this.game.canvas.style.touchAction="none",console.log("🔒 Canvas input disabled before GameOver")),document.querySelectorAll("canvas").forEach(l=>{l.style.pointerEvents="none",l.style.touchAction="none"});const s=this.scene.get("GameScene"),i=(s==null?void 0:s.score)||0,o=(s==null?void 0:s.coinsCollected)||0,a=parseInt(localStorage.getItem("flappyBearBestScore")||"0"),r=i>a;r&&(localStorage.setItem("flappyBearBestScore",i.toString()),console.log("New high score saved:",i)),console.log("🚀 LAUNCHING GameOverUIScene with score:",i),setTimeout(()=>{this.scene.start("GameOverUIScene",{currentLevelKey:"GameScene",score:i,bestScore:Math.max(i,a),coinsCollected:o,isNewHighScore:r})},100)}update(e,t){if(!this.gameOver){if(this.bear&&(this.bear.health<=0||this.bear.isDead)&&!this.gameOver){console.log("UPDATE LOOP: Bear is dead (health="+this.bear.health+", isDead="+this.bear.isDead+") - FORCING game over"),this.gameOver=!0,this.handleGameOver();return}this.bear&&this.bear.active&&this.bear.update(e,t),this.boss&&this.boss.active&&this.gameStarted&&this.boss.update(e,t,this.bear.y),this.missiles.children.entries.forEach(s=>{s.update&&s.update()}),this.spaceKey&&d.Input.Keyboard.JustDown(this.spaceKey)&&this.handleFlapInput(),this.missileKey&&d.Input.Keyboard.JustDown(this.missileKey)&&this.isMissileReady()&&this.handleMissileInput(),this.bear.y<50&&(this.bear.y=50,this.bear.body.setVelocityY(0)),this.bear.y>this.scale.height+100&&!this.gameOver&&(console.log("Bear fell off screen in second boss"),this.gameOver=!0,this.handleGameOver())}}setupPauseResumeHandlers(){console.log("🎮 Setting up pause/resume handlers for second boss scene"),this.events.on("pause",()=>{console.log("⏸️ SECOND BOSS SCENE PAUSED"),this.tweens.pauseAll(),this.boss&&this.boss.pauseBehavior&&this.boss.pauseBehavior()}),this.events.on("resume",()=>{console.log("▶️ SECOND BOSS SCENE RESUMED"),this.tweens.resumeAll(),this.boss&&this.boss.resumeBehavior&&this.boss.resumeBehavior(),this.bear&&!this.bear.isDead&&!this.gameOver&&console.log("✅ Bear state ok after resume - health:",this.bear.health)})}shutdown(){console.log("🧹 SECOND BOSS SCENE SHUTDOWN - Cleaning up"),this.musicManager&&this.musicManager.stop(),this.input.removeAllListeners(),this.events.removeAllListeners(),this.gameStarted=!1,this.gameOver=!1,this.bossDefeated=!1,this.isTransitioningToGameOver=!1,this.lastMissileTime=0,console.log("✅ SECOND BOSS SCENE CLEANUP COMPLETE")}}class me extends d.Scene{constructor(){super({key:"BossVictoryFlightScene"});n(this,"bear");n(this,"coins");n(this,"spaceKey");n(this,"gameStarted",!1);n(this,"collectionComplete",!1);n(this,"coinsCollected",0);n(this,"totalCoinsToCollect",40);n(this,"previousScore",0);n(this,"previousCoins",0);n(this,"currentSpeedMultiplier",1);n(this,"flightPath",[]);n(this,"currentPathIndex",0);n(this,"coinSpawnTimer")}init(e){this.previousScore=e.previousScore||0,this.previousCoins=e.previousCoins||0,this.currentSpeedMultiplier=e.speedMultiplier||1}create(){console.log("Boss Victory Flight Scene created"),this.coinsCollected=0,this.gameStarted=!1,this.collectionComplete=!1,this.currentPathIndex=0,this.createVictoryBackground(),this.createFlightPath(),this.createBear(),this.coins=this.add.group(),this.setupInput(),this.setupCollisions(),this.startCoinSpawning(),this.showVictoryMessage(),console.log("Boss Victory Flight Scene setup complete")}createVictoryBackground(){const e=this.add.graphics();e.fillGradientStyle(4386,4386,4491468,4491468,1),e.fillRect(0,0,this.scale.width,this.scale.height),this.createCelebrationParticles()}createCelebrationParticles(){for(let e=0;e<20;e++){const t=this.add.circle(d.Math.Between(0,this.scale.width),d.Math.Between(0,this.scale.height),d.Math.Between(2,5),16766720,.8);this.tweens.add({targets:t,y:t.y-100,alpha:0,duration:d.Math.Between(3e3,5e3),repeat:-1,yoyo:!0,ease:"Sine.easeInOut"})}}createFlightPath(){this.flightPath=[];const e=this.scale.width,t=this.scale.height,s=60;for(let i=0;i<=s;i++){const o=i/s,a=e*.1+e*.8*o,r=t*.3,h=t*.5+Math.sin(o*Math.PI*3)*r*(1-o*.5);this.flightPath.push(new d.Math.Vector2(a,h))}}createBear(){const e=this.flightPath[0];this.bear=new z(this,e.x,e.y),this.bear.body.setGravityY(300),this.bear.setTint(16777130),this.tweens.add({targets:this.bear,scale:{from:this.bear.scale*.95,to:this.bear.scale*1.05},duration:800,yoyo:!0,repeat:-1,ease:"Sine.easeInOut"})}setupInput(){var e;this.spaceKey=(e=this.input.keyboard)==null?void 0:e.addKey(d.Input.Keyboard.KeyCodes.SPACE),this.input.on("pointerdown",()=>{this.handleFlapInput()})}setupCollisions(){k(this,this.bear,this.coins,this.handleCoinCollection,void 0,this)}startCoinSpawning(){this.coinSpawnTimer=this.time.addEvent({delay:200,repeat:this.totalCoinsToCollect-1,callback:this.spawnNextCoin,callbackScope:this})}spawnNextCoin(){if(this.currentPathIndex>=this.flightPath.length)return;const e=this.flightPath[this.currentPathIndex],t=d.Math.Between(-30,30),s=d.Math.Between(-20,20),i=Math.random()<.4,o=i?"golden_bear_token":"xrp_token",a=this.add.image(e.x+t,e.y+s,o);if(b(a,{x:.5,y:.5},void 0,60),this.physics.add.existing(a),a.body.setAllowGravity(!1),a.isGoldenBear=i,this.coins.add(a),this.tweens.add({targets:a,angle:360,duration:1500,repeat:-1,ease:"Linear"}),i?this.tweens.add({targets:a,scale:{from:a.scale*.9,to:a.scale*1.1},duration:500,yoyo:!0,repeat:-1,ease:"Sine.easeInOut"}):a.setTint(11197951),this.currentPathIndex+=Math.ceil(this.flightPath.length/this.totalCoinsToCollect),this.currentPathIndex<this.flightPath.length){const r=this.flightPath[this.currentPathIndex],l=this.add.circle(r.x,r.y,3,16777215,.3);this.tweens.add({targets:l,alpha:0,scale:3,duration:1e3,onComplete:()=>l.destroy()})}}handleFlapInput(){this.collectionComplete||(this.gameStarted||(this.gameStarted=!0),this.bear.flap())}handleCoinCollection(e,t){if(this.collectionComplete)return;const s=t.isGoldenBear,i=s?f.pointsPerGoldenBearToken.value:f.pointsPerXRPToken.value;this.coinsCollected++,this.createVictoryCollectionEffect(t.x,t.y,s),this.sound.play("xrp_coin_pickup",{volume:.4});const o=s?"#FFD700":"#00DDFF";this.createScorePopup(t.x,t.y,i,o),this.coinsCollected>=this.totalCoinsToCollect&&this.completeCollection(),t.destroy()}createVictoryCollectionEffect(e,t,s){const o=s?16766720:56831;for(let a=0;a<15;a++){const r=a/15*Math.PI*2,l=d.Math.Between(100,200),h=Math.cos(r)*l,p=Math.sin(r)*l,m=this.add.circle(e,t,d.Math.Between(4,8),o,.9);m.setDepth(1500),this.tweens.add({targets:m,x:e+h*.6,y:t+p*.6,alpha:0,scale:.1,duration:800,ease:"Power2",onComplete:()=>m.destroy()})}this.cameras.main.shake(100,.005)}createScorePopup(e,t,s,i){const o=this.add.text(e,t,`+${s}`,{fontFamily:"SupercellMagic",fontSize:"32px",color:i,stroke:"#000000",strokeThickness:3});o.setOrigin(.5,.5),o.setDepth(1e3),this.tweens.add({targets:o,y:t-70,alpha:0,scale:1.3,duration:1200,ease:"Power2",onComplete:()=>o.destroy()})}completeCollection(){var s;this.collectionComplete=!0;const e=this.totalCoinsToCollect*f.pointsPerXRPToken.value,t=this.previousScore+e;console.log(`Collection complete! Bonus: ${e}, Total: ${t}`),(s=this.coinSpawnTimer)==null||s.destroy(),this.sound.play("new_high_score",{volume:.6}),this.showCompletionMessage(e,t),this.time.delayedCall(3e3,()=>{this.restartGameWithSpeedIncrease(t)})}showVictoryMessage(){const e=this.add.text(this.scale.width/2,this.scale.height*.15,`BOSS DEFEATED!
COLLECT THE VICTORY COINS!`,{fontFamily:"SupercellMagic",fontSize:"36px",color:"#FFD700",stroke:"#000000",strokeThickness:4,align:"center"});e.setOrigin(.5,.5),e.setDepth(2e3),e.setScrollFactor(0),this.tweens.add({targets:e,scale:{from:.8,to:1.2},duration:1e3,yoyo:!0,repeat:2,ease:"Sine.easeInOut",onComplete:()=>{this.tweens.add({targets:e,alpha:0,duration:1e3,onComplete:()=>e.destroy()})}})}showCompletionMessage(e,t){const s=this.add.text(this.scale.width/2,this.scale.height/2,`COLLECTION COMPLETE!
+${e} BONUS POINTS
TOTAL SCORE: ${t}

RESTARTING AT 1.5X SPEED...`,{fontFamily:"SupercellMagic",fontSize:"32px",color:"#00FF00",stroke:"#000000",strokeThickness:4,align:"center"});s.setOrigin(.5,.5),s.setDepth(2e3),s.setScrollFactor(0),this.tweens.add({targets:s,scale:{from:.5,to:1.2},alpha:{from:0,to:1},duration:800,ease:"Back.easeOut"})}restartGameWithSpeedIncrease(e){const t=this.currentSpeedMultiplier*1.5;console.log(`Restarting game with ${t}x speed multiplier`),localStorage.setItem("flappyBearAccumulatedScore",e.toString()),localStorage.setItem("flappyBearSpeedMultiplier",t.toString()),this.scene.stop("BossUIScene"),this.scene.start("GameScene",{speedMultiplier:t,accumulatedScore:e})}update(e,t){this.collectionComplete||(this.bear&&this.bear.active&&this.bear.update(e,t),this.spaceKey&&d.Input.Keyboard.JustDown(this.spaceKey)&&this.handleFlapInput(),this.coins.children.entries.forEach(s=>{s.y>this.scale.height+100&&s.destroy()}))}}class ge extends d.Scene{constructor(){super({key:"BossUIScene"});n(this,"uiContainer",null);n(this,"currentGameSceneKey",null);n(this,"uiUpdateTimer")}init(e){this.currentGameSceneKey=e.currentLevelKey||e.gameSceneKey||"BossLevelScene"}create(){this.createDOMUI(),this.setupMissileButton(),this.setupPauseButton(),this.setupMuteButton(),this.uiUpdateTimer=this.time.addEvent({delay:100,loop:!0,callback:this.updateUI,callbackScope:this}),this.setupPauseResumeHandlers()}createDOMUI(){const e=`
      <div id="boss-ui-container" class="fixed top-0 left-0 w-full h-full pointer-events-none z-[1000] font-supercell">
        
        <!-- Pause & Mute Buttons (Top Right) -->
        <div class="absolute top-4 right-4 flex gap-3 pointer-events-auto">
          <button id="pause-button" class="game-3d-container-clickable-[#F39C12] px-4 py-3 cursor-pointer hover:scale-110 transition-transform">
            <div class="text-white font-bold text-center" style="font-size: 24px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
              ⏸️
            </div>
          </button>
          <button id="mute-button" class="game-3d-container-clickable-[#2C3E50] px-4 py-3 cursor-pointer hover:scale-110 transition-transform">
            <div class="text-white font-bold text-center" style="font-size: 24px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
              <span id="mute-icon">🔊</span>
            </div>
          </button>
        </div>
        
        <!-- Top UI Bar -->
        <div class="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 pointer-events-auto">
          
          <!-- Player Health Bar -->
          <div class="game-3d-container-slot-[#2C3E50] p-2 w-80">
            <div class="text-white font-bold text-center mb-1" style="font-size: 16px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
              BEAR HEALTH
            </div>
            <div class="relative h-6 bg-gray-700 rounded overflow-hidden">
              <div id="player-health-fill" class="game-3d-container-progress-fill-[#27AE60] h-full transition-all duration-300" style="width: 100%;">
              </div>
              <div class="absolute inset-0 flex items-center justify-center">
                <span id="player-health-text" class="text-white font-bold text-sm">3/3</span>
              </div>
            </div>
          </div>
          
          <!-- Boss Health Bar -->
          <div class="game-3d-container-slot-[#8B0000] p-2 w-80">
            <div class="text-yellow-300 font-bold text-center mb-1" style="font-size: 18px; text-shadow: 2px 2px 0px rgba(0,0,0,0.5);">
              <span id="boss-name">BOSS</span> - PHASE <span id="boss-phase">1</span>
            </div>
            <div class="relative h-8 bg-gray-700 rounded overflow-hidden">
              <div id="boss-health-fill" class="game-3d-container-progress-fill-[#E74C3C] h-full transition-all duration-300" style="width: 100%;">
              </div>
              <div class="absolute inset-0 flex items-center justify-center">
                <span id="boss-health-text" class="text-white font-bold">300/300</span>
              </div>
            </div>
          </div>
          
          <!-- Phase Instructions -->
          <div id="phase-instructions" class="game-3d-container-[#6B46C1] px-4 py-2 max-w-sm text-center">
            <div class="text-yellow-300 font-bold" style="font-size: 14px; text-shadow: 1px 1px 0px rgba(0,0,0,0.5);">
              PHASE 1: SHOOT ANYWHERE ON BOSS
            </div>
          </div>
        </div>
        
        <!-- Mobile Missile Button -->
        <div class="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto">
          <div class="relative">
            <!-- Cooldown overlay -->
            <div id="missile-cooldown-overlay" class="absolute inset-0 bg-gray-800 bg-opacity-70 rounded-full flex items-center justify-center" style="width: 140px; height: 140px;">
              <div class="text-white font-bold text-xl" id="missile-cooldown-text">0.0s</div>
            </div>
            <!-- Main button -->
            <button id="missile-button" class="game-3d-container-clickable-[#FF6B00] p-5 rounded-full cursor-pointer select-none" style="
              width: 140px; 
              height: 140px; 
              touch-action: manipulation; 
              user-select: none; 
              -webkit-user-select: none; 
              -webkit-touch-callout: none;
              pointer-events: auto;
              position: relative;
              z-index: 100;
              outline: none;
              border: none;
              background: inherit;
            ">
              <div class="text-white font-bold text-2xl pointer-events-none">🚀</div>
              <div class="text-white font-bold text-sm mt-1 pointer-events-none">MISSILE</div>
            </button>
            <!-- Ready indicator -->
            <div id="missile-ready-glow" class="absolute inset-0 rounded-full border-4 border-green-400 opacity-0 animate-pulse" style="width: 140px; height: 140px;"></div>
          </div>
        </div>
        
        <!-- Instructions -->
        <div class="absolute bottom-6 left-6 pointer-events-none">
          <div class="game-3d-container-[#2C3E50] px-4 py-2">
            <div class="text-white font-bold text-center" style="font-size: 14px; text-shadow: 1px 1px 0px rgba(0,0,0,0.5);">
              SPACE: Flap | X: Missile | TAP CENTER: Missile
            </div>
          </div>
        </div>
        
      </div>
    `;this.uiContainer=U(this,e)}setupMissileButton(){if(!this.uiContainer||!this.uiContainer.node){console.log("❌ No UI container or node for missile button setup");return}const e=this.uiContainer.node.querySelector("#missile-button"),t=this.uiContainer.node.querySelector("#missile-cooldown-overlay");if(!e){console.log("❌ Missile button element not found!");return}console.log("🚀 Setting up missile button event handlers"),e.style.pointerEvents="auto",e.style.touchAction="manipulation",e.style.userSelect="none",e.style.webkitUserSelect="none",e.style.webkitTouchCallout="none";const s=o=>{if(o.preventDefault(),o.stopPropagation(),console.log("🚀 Missile button activated via",o.type,"at",Date.now()),!this.currentGameSceneKey){console.log("❌ No current game scene key");return}const a=this.scene.get(this.currentGameSceneKey);if(!a){console.log("❌ Boss scene not found:",this.currentGameSceneKey);return}if(!a.scene.isActive()){console.log("❌ Boss scene not active");return}if(!a.handleMissileInput||!a.isMissileReady){console.log("❌ Boss scene missing missile methods");return}a.isMissileReady()?(console.log("✅ Firing missile from UI button"),a.handleMissileInput(),e.style.transform="scale(0.8)",e.style.backgroundColor="#00FF00",e.style.boxShadow="0 0 20px #00FF00",this.time.delayedCall(150,()=>{e.style.transform="",e.style.backgroundColor="",e.style.boxShadow=""}),this.createDebugText("FIRED!",e,"#00FF00")):(console.log("⏳ Missile not ready yet - cooldown active"),e.style.filter="brightness(0.5)",e.style.backgroundColor="#FF0000",this.time.delayedCall(300,()=>{e.style.filter="",e.style.backgroundColor=""}),this.createDebugText("COOLDOWN!",e,"#FF0000"))};e._clickHandler&&e.removeEventListener("click",e._clickHandler),e._touchHandler&&e.removeEventListener("touchend",e._touchHandler),e._clickHandler=s,e._touchHandler=s,e.addEventListener("click",s,{passive:!1,capture:!1}),e.addEventListener("touchend",s,{passive:!1,capture:!1}),e.addEventListener("touchstart",o=>{o.preventDefault(),o.stopPropagation(),console.log("👆 Missile button touch start"),e.style.transform="scale(0.95)"},{passive:!1}),e.addEventListener("touchmove",o=>{o.preventDefault()},{passive:!1}),e.addEventListener("touchcancel",()=>{console.log("🚫 Missile button touch cancelled"),e.style.transform=""}),e.addEventListener("mousedown",o=>{o.preventDefault(),console.log("🖱️ Missile button mouse down"),e.style.transform="scale(0.95)"}),e.addEventListener("mouseup",()=>{e.style.transform=""}),e.addEventListener("mouseleave",()=>{e.style.transform=""}),t&&(t.style.pointerEvents="none",console.log("🔧 Cooldown overlay set to not block pointer events"));const i=e.parentElement;i&&(i.style.pointerEvents="auto"),console.log("✅ Missile button setup complete with enhanced touch/click handling")}createDebugText(e,t,s){const i=t.getBoundingClientRect(),o=document.createElement("div");o.textContent=e,o.style.position="fixed",o.style.left=`${i.left+i.width/2}px`,o.style.top=`${i.top}px`,o.style.color=s,o.style.fontSize="24px",o.style.fontWeight="bold",o.style.fontFamily="SupercellMagic",o.style.textShadow="2px 2px 4px rgba(0,0,0,0.8)",o.style.pointerEvents="none",o.style.zIndex="10000",o.style.transform="translateX(-50%)",o.style.transition="all 1s ease-out",document.body.appendChild(o),setTimeout(()=>{o.style.transform="translateX(-50%) translateY(-100px)",o.style.opacity="0"},50),setTimeout(()=>{o.parentNode&&o.parentNode.removeChild(o)},1100)}updateUI(){if(!this.currentGameSceneKey||!this.uiContainer||!this.uiContainer.node)return;const e=this.scene.get(this.currentGameSceneKey);if(!e||!e.bear||!e.boss)return;const t=this.uiContainer.node.querySelector("#player-health-fill"),s=this.uiContainer.node.querySelector("#player-health-text");if(t&&s){const h=e.bear.health/e.bear.maxHealth*100;t.style.width=`${h}%`,s.textContent=`${e.bear.health}/${e.bear.maxHealth}`,h>60?t.className="game-3d-container-progress-fill-[#27AE60] h-full transition-all duration-300":h>30?t.className="game-3d-container-progress-fill-[#F39C12] h-full transition-all duration-300":t.className="game-3d-container-progress-fill-[#E74C3C] h-full transition-all duration-300"}const i=this.uiContainer.node.querySelector("#boss-health-fill"),o=this.uiContainer.node.querySelector("#boss-health-text"),a=this.uiContainer.node.querySelector("#boss-phase"),r=this.uiContainer.node.querySelector("#boss-name");if(i&&o&&a){const h=e.boss.getHealthPercentage();i.style.width=`${h}%`,o.textContent=`${e.boss.health}/${e.boss.maxHealth}`,a.textContent=e.boss.currentPhase.toString(),r&&(this.currentGameSceneKey==="SecondBossLevelScene"?r.textContent="SECOND BOSS":r.textContent="GARY GENSLER")}const l=this.uiContainer.node.querySelector("#phase-instructions");if(l){const h=e.boss.currentPhase;let p="";if(this.currentGameSceneKey==="SecondBossLevelScene")switch(h){case 1:p="PHASE 1: SHOOT ANYWHERE ON BOSS";break;case 2:p="PHASE 2: TWIN FIREBALLS - SHOOT ANYWHERE";break;case 3:p="PHASE 3: MULTI-ATTACK - SHOOT ANYWHERE";break}else switch(h){case 1:p="PHASE 1: SHOOT ANYWHERE ON GARY";break;case 2:p="PHASE 2: MOUTH LASER - SHOOT ANYWHERE";break;case 3:p="PHASE 3: THIRD EYE - SHOOT ANYWHERE";break}const m=l.querySelector("div");m&&(m.textContent=p)}this.updateMissileButton(e)}updateMissileButton(e){if(!this.uiContainer||!this.uiContainer.node)return;const t=this.uiContainer.node.querySelector("#missile-cooldown-overlay"),s=this.uiContainer.node.querySelector("#missile-cooldown-text"),i=this.uiContainer.node.querySelector("#missile-ready-glow"),o=this.uiContainer.node.querySelector("#missile-button");if(!t||!s||!i||!o)return;const a=e.isMissileReady();if(e.getMissileCooldownProgress(),a)t.style.opacity="0",i.style.opacity="1",o.style.filter="brightness(1.2)";else{const r=e.missileCooldown-(e.time.now-e.lastMissileTime),l=Math.max(0,r/1e3);t.style.opacity="1",s.textContent=`${l.toFixed(1)}s`,i.style.opacity="0",o.style.filter="brightness(0.7)"}}setupPauseButton(){if(!this.uiContainer||!this.uiContainer.node)return;const e=this.uiContainer.node.querySelector("#pause-button");e&&e.addEventListener("click",t=>{t.preventDefault(),t.stopPropagation(),console.log("⏸️ Pause button clicked in boss fight - Scene:",this.currentGameSceneKey),this.scene.launch("PauseMenuScene",{gameSceneKey:this.currentGameSceneKey}),this.currentGameSceneKey&&(console.log("⏸️ Pausing boss scene:",this.currentGameSceneKey),this.scene.pause(this.currentGameSceneKey)),console.log("✅ Pause setup complete")})}setupMuteButton(){if(!this.uiContainer||!this.uiContainer.node)return;const e=this.uiContainer.node.querySelector("#mute-button"),t=this.uiContainer.node.querySelector("#mute-icon");if(e&&t){const s=localStorage.getItem("flappyBearAllSoundsMuted")==="true";t.textContent=s?"🔇":"🔊",s&&(this.sound.mute=!0,C.getInstance().setMuted(!0)),e.addEventListener("click",i=>{i.preventDefault(),i.stopPropagation();const o=!this.sound.mute;this.sound.mute=o,C.getInstance().setMuted(o),t.textContent=o?"🔇":"🔊",localStorage.setItem("flappyBearAllSoundsMuted",o.toString()),console.log("Boss UI: Mute toggled to",o)})}}setupPauseResumeHandlers(){console.log("🎮 Setting up pause/resume handlers for BossUIScene"),console.log("✅ Pause/resume handlers setup complete (minimal interference mode)")}shutdown(){if(console.log("🧹 BOSS UI SCENE SHUTDOWN"),this.uiUpdateTimer&&this.uiUpdateTimer.destroy(),this.uiContainer&&this.uiContainer.node){const e=this.uiContainer.node.querySelector("#missile-button");if(e&&e._missileHandler){const i=e._missileHandler;e.removeEventListener("click",i),e.removeEventListener("touchend",i),console.log("🧹 Missile button event listeners cleaned up")}const t=this.uiContainer.node.querySelector("#pause-button");t&&t.removeEventListener("click",()=>{});const s=this.uiContainer.node.querySelector("#mute-button");s&&s.removeEventListener("click",()=>{})}this.uiContainer&&(console.log("🧹 Destroying BossUIScene DOM element"),this.uiContainer.destroy(),this.uiContainer=null),console.log("✅ BOSS UI SCENE CLEANUP COMPLETE")}}const fe={type:d.AUTO,width:L.width.value,height:L.height.value,backgroundColor:"#87CEEB",parent:"game-container",dom:{createContainer:!0},scale:{mode:d.Scale.FIT,autoCenter:d.Scale.CENTER_BOTH,width:L.width.value,height:L.height.value,fullscreenTarget:"game-container"},physics:{default:"arcade",arcade:{fps:120,debug:R.debug.value,debugShowBody:R.debug.value,debugShowStaticBody:R.debug.value,debugShowVelocity:R.debug.value}},pixelArt:ee.pixelArt.value,input:{windowEvents:!0}},T=new d.Game(fe);T.scene.add("Preloader",se,!0);T.scene.add("TitleScreen",ne);T.scene.add("GameScene",W);T.scene.add("BossLevelScene",de);T.scene.add("SecondBossLevelScene",pe);T.scene.add("BossVictoryFlightScene",me);T.scene.add("UIScene",re);T.scene.add("BossUIScene",ge);T.scene.add("PauseMenuScene",ce);T.scene.add("GameOverUIScene",le);
