import Phaser from 'phaser';
import { BattleScene } from '../scenes/BattleScene';

type FSMState = 'IDLE' | 'INTRO' | 'COMMAND' | 'LOCKED' | 'RESOLVE' | 'FAINT_CHECK' | 'END';

const STATES: Record<FSMState, (fsm: BattleFSM) => void> = {
  IDLE: () => {},
  INTRO: (fsm) => {
    const scene = fsm.scene;
    scene.showDialog('A wild foe appeared!').then(() => {
      fsm.setState('COMMAND');
    });
  },
  COMMAND: (_fsm) => {
    // Menu shown by scene — waiting for player input
    // Turn timer managed server-side; client renders it
  },
  LOCKED: () => {
    // Waiting for server turnResolved
  },
  RESOLVE: (fsm) => {
    // Animation queue processes events
    fsm.getQueue().processNext(() => {
      fsm.setState('FAINT_CHECK');
    });
  },
  FAINT_CHECK: (fsm) => {
    // Check if either mon fainted — handled by queue events
    fsm.setState('COMMAND');
  },
  END: (fsm) => {
    fsm.scene.showDialog('Battle over!');
  },
};

export class BattleFSM {
  scene: BattleScene;
  private state: FSMState = 'IDLE';
  private queue: import('./queue').AnimationQueue;

  constructor(scene: BattleScene) {
    this.scene = scene;
    this.queue = scene.getQueue();
  }

  start() {
    this.setState('INTRO');
  }

  setState(name: FSMState) {
    this.state = name;
    STATES[name]?.(this);
  }

  getState(): FSMState {
    return this.state;
  }

  getQueue() {
    return this.queue;
  }
}
