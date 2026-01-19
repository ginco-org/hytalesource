import { Select } from "antd";
import { useObservable } from "../../utils/UseObservable";
import { getLeftDiff, getRightDiff } from "../../logic/Diff";

const DiffVersionSelection = () => {
    // Diff functionality is currently disabled for local jar mode
    const leftVersion = useObservable(getLeftDiff().selectedVersion);
    const rightVersion = useObservable(getRightDiff().selectedVersion);

    return (
        <>
            <Select
                value={leftVersion || "local"}
                disabled
            >
                <Select.Option key={"local"} value={"local"}>local</Select.Option>
            </Select>
            <span style={{ fontSize: 12, color: '#888' }}>→</span>
            <Select
                value={rightVersion || "local"}
                disabled
            >
                <Select.Option key={"local"} value={"local"}>local</Select.Option>
            </Select>
        </>
    );
};

export default DiffVersionSelection;
