// 자원이 제한된 환경(예: Render 무료 플랜의 512MB RAM)에서 동시에 뜨는
// 무거운 작업(Playwright 캡처 등)의 개수를 제한해, 여러 세션이 겹쳐도
// 서버가 메모리 부족으로 죽지 않도록 한다. 초과 요청은 큐에서 순서대로 대기한다.
export class Semaphore {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}
