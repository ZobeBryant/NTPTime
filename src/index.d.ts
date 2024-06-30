declare type TimeOriginConfig = {
    enable: boolean;
    tolerantRTT: number;
    bestRTT: number;
    maxChances: number;
};
/** 时间原点定义 */
declare type Origin = {
    timestamp: number;
    rtt: number;
    baseClock: number;
    baseTime: number;
};
export declare type TimeNode = {
    clock: number;
    time: number;
};
export default class TimeOrigin {
    serverOrigin: Origin;
    config: TimeOriginConfig;
    isSettingNTP: boolean;
    currentChance: number;
    failedDelay: number;
    successDelay: number;
    timer: number;
    constructor(config: Partial<TimeOriginConfig>);
    reset(): void;
    setOriginTimetick(): Promise<void>;
    private doSet;
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
    getNTPTime(currentTimeNode?: TimeNode): number;
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
    checkNodeReliable(currentTimeNode: TimeNode): boolean;
    static checkPerformance(): boolean;
    /**
     * 设置 NTP 时间基准点。
     */
    private setServerOrigin;
    /**
     * 获取此刻的时间节点
     *
     * 包含 performance.now()，与 Date.now()
     *
     * performance.now() 的缺点是程序退入后台或者休眠后, 这个值会比实际的时间流逝值要小. 并且许多平台是不支持 performance 的
     * Date.now() 的缺点是, 实例运行途中, 如果用户手动修改了系统时间, 没有手段能监测. 那么这个值就会不准确.
     */
    getTimeNode(): TimeNode;
    static getTimeNode(): TimeNode;
}
export {};
