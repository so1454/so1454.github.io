(() => {
  'use strict';
  const button = document.querySelector('#pop');
  const canvas = document.querySelector('#popcorn');
  const ctx = canvas.getContext('2d', { alpha: true });
  const status = document.querySelector('#status');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const flavors = ['butter','classic','chili','chocolate','caramel','toffee','cinnamon','pepper','herb','strawberry','cheddar','salted'];
  const textures = flavors.map(name => {
    const image = new Image();
    image.src = `./assets/${name}.webp`;
    return image;
  });
  let width = 0, height = 0, dpr = 1, frame = 0, lastTime = 0, burstCount = 0;
  let particles = [], anim = null, pressTimer;
  const random = (min,max) => min + Math.random() * (max-min);
  const MAX_PARTICLES = 132;
  const clickSound = createClickSound();

  function createClickSound() {
    const soundData = window.POPCORN_AUDIO;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    let context, output, ready, nextClip = 0;
    const voices = new Set();

    function prepare() {
      if (ready || !AudioContextClass || !soundData) return;
      try {
        context = new AudioContextClass({latencyHint:'interactive'});
        output = context.createGain();
        output.gain.value = soundData.volume;
        output.connect(context.destination);
        const bytes = Uint8Array.from(atob(soundData.base64),c=>c.charCodeAt(0));
        ready = context.decodeAudioData(bytes.buffer).catch(()=>null);
      } catch (_) { ready = Promise.resolve(null); }
    }

    // Decode before the first click. Nothing plays until a user gesture.
    prepare();
    return () => {
      prepare();
      if (!context || !ready || document.hidden) return;
      const requestedAt = performance.now();
      const clip = soundData.clips[nextClip++ % soundData.clips.length];
      const resume = context.state === 'running' ? Promise.resolve() : context.resume();
      Promise.all([ready,resume]).then(([buffer])=>{
        if (!buffer || context.state !== 'running' || document.hidden || performance.now()-requestedAt>250) return;
        // A new source for each click lets rapid clicks overlap naturally.
        if (voices.size >= 16) {
          const oldest = voices.values().next().value;
          oldest.stop();
          voices.delete(oldest);
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(output);
        source.onended = () => {voices.delete(source);source.disconnect();};
        voices.add(source);
        source.start(0,clip.offset,clip.duration);
      }).catch(()=>{});
    };
  }

  function resize() {
    const oldW = width, oldH = height;
    width = innerWidth; height = document.querySelector('.playground').clientHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if (oldW && oldH) particles.forEach(p => {p.x *= width/oldW;p.y *= height/oldH;});
    if (!frame) draw();
  }

  function draw() {
    ctx.clearRect(0,0,width,height);
    for (const p of particles) {
      if (!p.image.complete || !p.image.naturalWidth || p.age < 0) continue;
      const appear = Math.min(1,p.age/.1);
      const disappear = Math.min(1,Math.max(0,(p.life-p.age)/.7));
      const squash = p.squash || 1;
      ctx.save();
      ctx.globalAlpha = appear*disappear;
      ctx.translate(p.x,p.y);
      ctx.rotate(p.rotation);
      ctx.scale(p.scale,p.scale*squash);
      ctx.drawImage(p.image,-p.size/2,-p.size/2,p.size,p.size);
      ctx.restore();
    }
  }

  function tick(now) {
    const dt = Math.min((now-lastTime)/1000 || .016, .035);
    lastTime = now;
    for (const p of particles) {
      p.age += dt;
      if (p.age < 0) continue;
      p.vy += p.gravity*dt;
      p.x += p.vx*dt;
      p.y += p.vy*dt;
      p.rotation += p.spin*dt;
      p.scale += (1-p.scale)*Math.min(1,dt*14);
      p.squash += (1-p.squash)*Math.min(1,dt*12);
      if (p.y > height-p.size*.31 && p.vy>0) {
        p.y = height-p.size*.31;
        if (Math.abs(p.vy)>45) {
          p.vy *= -.33;
          p.vx *= .61;
          p.spin *= .53;
          p.squash = 1.18;
        } else {p.vy=0;p.vx*=Math.pow(.12,dt);p.spin*=Math.pow(.018,dt);}
      }
      if (p.x < p.size*.3 && p.vx<0) {p.x=p.size*.3;p.vx*=-.62;}
      if (p.x > width-p.size*.3 && p.vx>0) {p.x=width-p.size*.3;p.vx*=-.62;}
    }
    particles = particles.filter(p=>p.age<p.life);
    draw();
    if (particles.length) frame=requestAnimationFrame(tick);
    else {frame=0;lastTime=0;}
  }

  function start() {
    if (!frame) {lastTime=performance.now();frame=requestAnimationFrame(tick);}
  }

  function press() {
    clearTimeout(pressTimer);
    button.classList.add('pressed');
    if (anim) anim.cancel();
    if (!reducedMotion) anim = button.animate([
      {transform:'scale(1)'},
      {transform:'scale(.9)',offset:.23},
      {transform:'scale(1.045)',offset:.52},
      {transform:'scale(.985)',offset:.76},
      {transform:'scale(1)'}
    ],{duration:490,easing:'cubic-bezier(.24,.8,.3,1)'});
    pressTimer=setTimeout(()=>button.classList.remove('pressed'),130);
  }

  function pop() {
    clickSound();
    press();
    burstCount++;
    status.textContent = `${burstCount}번째 팝콘이 터졌어요.`;
    const box=button.getBoundingClientRect();
    const unit=box.width/333;
    const count=reducedMotion?5:12;
    const gravity=reducedMotion?300*unit:1050*unit;
    for(let i=0;i<count;i++) {
      const fan=(i/(count-1)-.5);
      const size=random(69,91)*unit;
      particles.push({
        image:textures[(i+burstCount-1)%textures.length],
        x:box.left+box.width*.5+fan*box.width*.55,
        y:box.top+box.height*.19+random(-8,13)*unit,
        vx:fan*random(570,780)*unit,
        vy:reducedMotion?random(-150,-220)*unit:random(-620,-840)*unit,
        gravity,size,rotation:random(-.5,.5),spin:random(-3.2,3.2),
        scale:.58,squash:1,age:reducedMotion?0:-i*.014,
        life:reducedMotion?1.2:random(5.4,6.9)
      });
    }
    if (particles.length>MAX_PARTICLES) particles.splice(0,particles.length-MAX_PARTICLES);
    start();
  }

  button.addEventListener('click',pop);
  window.addEventListener('keydown',event=>{
    if ((event.code==='Space'||event.code==='Enter') && event.target!==button && !event.repeat) {
      event.preventDefault();pop();
    }
  });
  window.addEventListener('resize',resize,{passive:true});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden && frame){cancelAnimationFrame(frame);frame=0;}
    else if(!document.hidden && particles.length) start();
  });
  resize();
})();
