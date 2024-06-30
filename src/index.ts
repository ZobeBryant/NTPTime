import { getServerTime } from "./utils/request";
import { platform } from "./utils/platform";


type TimeOriginConfig = {
  enable: boolean // 开关, 是否需要校准时间
  tolerantRTT: number // 最大可以容忍的 rtt 时间大小为 3000 ms
  bestRTT: number // 最优的 rtt 耗时在 100ms
  maxChances: number // 失败后的最大尝试次数
}

const defaultTimeOriginConfig: TimeOriginConfig = {
  tolerantRTT: 3000, // 最大可以容忍的 rtt 时间大小为 3000 ms
  bestRTT: 100, // 最优的 rtt 耗时在 100ms
  maxChances: 5, // 失败后的最大尝试次数
  enable: true
}

/** 时间原点定义 */
type Origin = {
  // getServerTime数据包到达客户端时，服务器的时间
  timestamp: number
  // 发包与收包时间只差
  rtt: number
  // getServerTime到达客户端时，客户端的时钟 performance.now
  baseClock: number
  // getServerTime到达客户端时，客户端的系统时间 Date.now()
  baseTime: number
}

const defaultOrigin: Origin = { timestamp: 0, rtt: 0, baseClock: 0, baseTime: 0 };

export type TimeNode = {
  // 当前时刻 客户端的时钟 performance.now
  clock: number
  // 当前时刻的系统时间 Date.now()
  time: number
}

export default class TimeOrigin {
  // 服务端给的时间原点
  serverOrigin = defaultOrigin;
  config = defaultTimeOriginConfig;
  isSettingNTP = false; // 是否正在计算 ntp 之中
  currentChance = 0; // 当前是第几次请求这个 rtt 数量
  failedDelay = 2000; // 原点设置失败后,定时 2s 再次尝试设置
  successDelay = 5 * 60 * 1000; // 原点若是设置成功了, 定时 5 分钟再次设置
  timer = 0; // 定时器

  constructor(config: Partial<TimeOriginConfig>) {
    this.config = { ...this.config, ...config };
  }

  reset() {
    this.timer && clearTimeout(this.timer);
    this.serverOrigin = defaultOrigin;
    this.isSettingNTP = false;
    // 重置当前尝试次数
    this.currentChance = 0;
  }

  async setOriginTimetick() {
    // 没有打开时间校准开关, 或者正在设置时间校准, 或者已经超过最大尝试次数，直接返回
    if (
      !this.config.enable ||
      this.isSettingNTP ||
      this.currentChance >= this.config.maxChances
    )
      return;
    this.isSettingNTP = true;
    this.currentChance++;
    this.timer && clearTimeout(this.timer);
    this.timer = 0;
    let serverTime;
    const t1 = Date.now();
    try {
      serverTime = await getServerTime();
    } catch (error) {
      console.warn("Calculate Delay time, getServerTime error: ", error);
      this.timer = setTimeout(
        this.setServerOrigin.bind(this),
        this.failedDelay
      ) as unknown as number;
      return;
    }
    const rtt = Date.now() - t1;
    this.doSet(serverTime, rtt)
  }

  private doSet(serverTime: number, rtt: number) {
    if (rtt > this.config.tolerantRTT) {
      /** 超出最大 rtt 容忍时间，此次计算作废 */
      console.warn(
        `Denied, cause of exceeding the maximum tolerance range of RTT: ${rtt}`
      );
      // 定时类似心跳的间隔再重新计算
      this.timer = setTimeout(
        this.setOriginTimetick.bind(this),
        this.failedDelay
      ) as unknown as number;;
      return;
    } else if (rtt > this.config.bestRTT) {
      /** 在最大 rtt 容忍时间范围内，但大于最优的时间范围内 */
      // 若新来的 rtt 的确比前面那次要更小，则更新. 反之则不更新
      if (this.serverOrigin.rtt && rtt >= this.serverOrigin.rtt) {
        console.log(`Denied, cause of current.RTT >= serverOrigin.RTT: ${rtt}`)
      } else {
        this.setServerOrigin(rtt, serverTime);
        console.log(`Accept within maximum tolerance range of RTT: ${rtt}, ntpTimestamp: ${this.serverOrigin.timestamp}, localClock: ${this.serverOrigin.baseClock}, localTime: ${this.serverOrigin.baseTime}`)
      }
      // 超过最佳 rtt 时间，但是尚且可以容忍, 再次计算他
      // 定时类似心跳的间隔再重新计算
      this.timer = setTimeout(this.setOriginTimetick.bind(this), this.failedDelay) as unknown as number
      // 如果在最大 rtt 容忍时间范围内，但大于最优的时间范围，并且已经达到最大尝试次数，则尝试次数归 0。只有超出最大 rtt 容忍时间范围内，并且到达了最大尝试次数，才会停止请求服务器时间。
      if (this.currentChance + 1 === this.config.maxChances) {
        this.currentChance = 0
      }
    } else {
      /** 在最优的时间范围内 */
      this.setServerOrigin(rtt, serverTime)
      // 达成最佳 rtt 时间, 则不再计算
      console.log(`Accept within best RTT: ${rtt}, ntpTimestamp: ${this.serverOrigin.timestamp}, localClock: ${this.serverOrigin.baseClock}, localTime: ${this.serverOrigin.baseTime}`)
      // 成功设置后, 尝试次数归 0
      this.currentChance = 0
      this.timer = setTimeout(this.setOriginTimetick.bind(this), this.successDelay) as unknown as number

    }
  }

  /**
   * 获取端测可信的时间。若返回 0 则是一个不可相信的时间
   *
   *
   * @param currentTimeNode 本地时间节点, 包含 performance.now 时刻以及 Date.now() 系统时间
   *
   *                           t2（服务器时间-响应的此刻时间戳）
   *                          /  \
   *                         /    \
   *                        /      \
   * t1（端测时间-发起6-23协议） ------ t3（端测时间-接到回包）        ......(过了不知道多久)  t4
   *
   * t4 此刻真实时间 = t2 这个时刻, 即原点时刻的服务器时间(serverOrigin.timeStamp) + t2 到 t3 的差值 + t3 到 t4 的差值(也被称为 elapseTime)。
   * t3 - t1 为 rtt 时间，代表发包与收包时间之差。t2 到 t3 的差值 ≈ 一半的 rtt。
   * t3 到 t4 的差值(被称为 elapseTime) = t4 时刻的时间节点 - t3 时刻的时间节点，即为时间流逝值。
   */
  getNTPTime(currentTimeNode?: TimeNode): number {
    if (typeof currentTimeNode === 'undefined') {
      currentTimeNode = this.getTimeNode()
    }

    if (this.checkNodeReliable(currentTimeNode)) {
      // 可信则计算时间
      const elapseTime = Math.floor(currentTimeNode.time - this.serverOrigin.baseTime)
      return this.serverOrigin.timestamp + elapseTime
    } else {
      // 输入了不可信的时间节点, 强行还要调用 getNTPTime 则直接返回当前系统时间吧
      return Date.now()
    }
  }

  /**
   * 校验时间节点的偏移是否可信,
   *
   * 本地时钟的偏移量，和本地系统时间的偏移量的相对差值. 如果小于 500ms，就认为是可信的
   * 如下图例子，偏移量 B 大于偏移量 A，那么可能是本地时间被用户修改了, 也可能是休眠了一段时间导致 performance.now() 流逝的比真实时间慢.
   *
   *       原点时刻   ....... 这个时刻
   *       clock1            clock2
   *         |      偏移量A     |
   *         |      偏移量B     |
   *       time1             time2
   */
  checkNodeReliable(currentTimeNode: TimeNode): boolean {
    if (this.serverOrigin.timestamp) {
      // 不支持 performance.now() 的环境也只能采用系统时间, 当作可信吧
      if (this.serverOrigin.baseClock === 0) return true
      const differenceOfClock = currentTimeNode.clock - this.serverOrigin.baseClock
      const differenceOfClientTime = currentTimeNode.time - this.serverOrigin.baseTime
      return Math.abs(differenceOfClientTime - differenceOfClock) < 500
    }
    // 未得到时间校验原点，当作不可信.
    return false
  }

  // 检查是否支持 performance.now()
  // 鉴于微信小程序一读取 performance 就会抛出异常, 尚未知其他小程序以及 uniapp 的表现，故而目前在非浏览器都先判定为不支持
  static checkPerformance(): boolean {
    if (platform !== "BROWSER") return false;
    if (typeof performance !== "undefined" && !!performance.now) return true;
    return false;
  }
  /**
   * 设置 NTP 时间基准点。
   */
  private setServerOrigin(rtt: number, serverTime: number) {
    this.serverOrigin = {
      timestamp: serverTime + Math.floor(rtt / 2),
      rtt,
      baseClock: TimeOrigin.checkPerformance() ? performance.now() : 0,
      baseTime: Date.now(),
    };
  }

  /**
   * 获取此刻的时间节点
   *
   * 包含 performance.now()，与 Date.now()
   *
   * performance.now() 的缺点是程序退入后台或者休眠后, 这个值会比实际的时间流逝值要小. 并且许多平台是不支持 performance 的
   * Date.now() 的缺点是, 实例运行途中, 如果用户手动修改了系统时间, 没有手段能监测. 那么这个值就会不准确.
   */
  getTimeNode(): TimeNode {
    return {
      clock: TimeOrigin.checkPerformance() ? performance.now() : 0,
      time: Date.now(),
    };
  }

  static getTimeNode(): TimeNode {
    return {
      clock: TimeOrigin.checkPerformance() ? performance.now() : 0,
      time: Date.now(),
    };
  }
}
